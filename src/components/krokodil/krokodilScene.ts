import {
  BackSide,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Shape,
  ShadowMaterial,
  ShapeGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { TOOTH_COUNT } from './krokodilConfig';

// A cartoony low-poly crocodile built from primitives, so there are no model
// files to load. The game rules live in KrokodilWidget; this module only draws
// the croc, reports which tooth was clicked and plays the animations.

const OPEN_ANGLE   = 0.95;  // upper jaw, radians above closed
const WINDUP_ANGLE = 1.08;  // how far it creaks open right before it slams
const SINK_DEPTH   = 0.3;   // how far a pressed tooth sinks into the gum
const GROUND_Y     = -0.56;

// Camera framing: orbit angles around TARGET, distance fitted to FIT_RADIUS.
const VIEW_AZIMUTH   = 0.62;
const VIEW_ELEVATION = 0.52;
const VIEW_TARGET    = new Vector3(0.2, 0.85, 1.1);
const FIT_RADIUS     = 3.05;
const FOV            = 30;

const COLORS = {
  skin:      '#62c14b',
  skinDark:  '#3f8f39',
  belly:     '#cfe58a',
  mouth:     '#ff8aa3',
  tongue:    '#ff5c80',
  throat:    '#b8324f',
  tooth:     '#fff8e6',
  toothUsed: '#e3d6b8',
  eye:       '#ffffff',
  pupil:     '#1d1d22',
  outline:   '#ffd23f',
};

type Ease = (t: number) => number;
const linear: Ease       = (t) => t;
const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
const easeInCubic: Ease  = (t) => t ** 3;
const easeInQuad: Ease   = (t) => t * t;
const easeOutBack: Ease  = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

interface Tween {
  start:    number;
  duration: number;
  ease:     Ease;
  update:   (k: number) => void;
  done:     () => void;
}

interface Tooth {
  mesh:    Mesh;   // the visible tooth; sinks when pressed
  hull:    Mesh;   // back-face shell drawn as the hover outline
  proxy:   Mesh;   // larger invisible hit area, so small teeth are easy to hit
  pressed: boolean;
  sink:    number; // 0 = standing, 1 = pressed down
  lift:    number; // eased hover lift
}

interface Eye {
  group: Group;  // turned towards whatever the croc is looking at
  lid:   Mesh;   // dome that rotates down over the eye
}

interface Particle {
  mesh: Mesh;
  vel:  Vector3;
  spin: Vector3;
  born: number;
}

export interface KrokodilSceneOptions {
  /** Called when the player clicks (or presses Enter on) a standing tooth. */
  onToothPress: (index: number) => void;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

const mat = (color: string) => new MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, metalness: 0 });

/** Top-down outline of a snout: hinge edge at z=0, rounded tip towards +z (shape y = world z). */
function snoutShape(sx = 1, sz = 1): Shape {
  const s = new Shape();
  const P = (x: number, z: number): [number, number] => [x * sx, z * sz];
  const curve = (a: [number, number], b: [number, number], c: [number, number]) => s.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);
  s.moveTo(...P(-1.25, 0));
  curve(P(-1.25, 0.9), P(-0.8, 1.3), P(-0.82, 2.1));
  curve(P(-0.84, 2.7), P(-1.0, 2.95), P(-0.96, 3.35));
  curve(P(-0.9, 3.98), P(0.9, 3.98), P(0.96, 3.35));
  curve(P(1.0, 2.95), P(0.84, 2.7), P(0.82, 2.1));
  curve(P(0.8, 1.3), P(1.25, 0.9), P(1.25, 0));
  s.closePath();
  return s;
}

/** A jaw slab lying flat, with its caps at y=0 and y=-thickness (shifted by `lift`). */
function slab(shape: Shape, depth: number, lift: number): BufferGeometry {
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 7,
  });
  geo.rotateX(Math.PI / 2);        // shape y → world z, extrusion → world -y
  geo.translate(0, lift - 0.1, 0); // top cap at y = lift
  return geo;
}

/** Evenly spaced points along the curved part of an outline (z > zMin), moved `inset` inwards. */
function slotsAlong(shape: Shape, inset: number, zMin: number, count: number) {
  const pts = shape.getSpacedPoints(320);
  const run: { x: number; z: number; ox: number; oz: number }[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (p.y < zMin) continue;
    const tx = pts[i + 1].x - pts[i - 1].x;
    const tz = pts[i + 1].y - pts[i - 1].y;
    const len = Math.hypot(tx, tz) || 1;
    // The outline runs clockwise seen from above, so the tangent turned right points inwards.
    const ix = tz / len;
    const iz = -tx / len;
    run.push({ x: p.x + ix * inset, z: p.y + iz * inset, ox: -ix, oz: -iz });
  }
  const acc = [0];
  for (let i = 1; i < run.length; i++) acc.push(acc[i - 1] + Math.hypot(run[i].x - run[i - 1].x, run[i].z - run[i - 1].z));
  const total = acc[acc.length - 1];
  const slots: { x: number; z: number; ox: number; oz: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (j < run.length - 2 && acc[j + 1] < target) j++;
    const f = Math.min(1, (target - acc[j]) / (acc[j + 1] - acc[j] || 1));
    const a = run[j];
    const b = run[j + 1];
    slots.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ox: a.ox, oz: a.oz });
  }
  return slots;
}

/** Tilts an object so its +y axis leans `amount` towards the outward direction (ox, oz). */
function leanOut(obj: Object3D, ox: number, oz: number, amount: number) {
  const up = new Vector3(ox * amount, 1, oz * amount).normalize();
  obj.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
}

function blob(radius: number, detail: number, material: Material, scale: [number, number, number], pos: [number, number, number]) {
  const mesh = new Mesh(new IcosahedronGeometry(radius, detail), material);
  mesh.scale.set(...scale);
  mesh.position.set(...pos);
  return mesh;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export class KrokodilScene {
  private readonly container: HTMLElement;
  private readonly options: KrokodilSceneOptions;
  private readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly root = new Group();      // the whole croc; squashes on impact
  private readonly upperJaw = new Group();  // pivots around the hinge at the origin
  private readonly tail = new Group();
  private readonly teeth: Tooth[] = [];
  private readonly eyes: Eye[] = [];
  private readonly occluders: Mesh[] = [];
  private readonly particles: Particle[] = [];
  private readonly materials = {
    skin:      mat(COLORS.skin),
    skinDark:  mat(COLORS.skinDark),
    belly:     mat(COLORS.belly),
    mouth:     mat(COLORS.mouth),
    palate:    new MeshStandardMaterial({ color: COLORS.mouth, emissive: '#7a2338', flatShading: true, roughness: 0.8 }),
    tongue:    mat(COLORS.tongue),
    throat:    mat(COLORS.throat),
    tooth:     mat(COLORS.tooth),
    toothUsed: mat(COLORS.toothUsed),
    toothHot:  new MeshStandardMaterial({ color: COLORS.tooth, emissive: '#7a5c00', flatShading: true, roughness: 0.6 }),
    eye:       new MeshStandardMaterial({ color: COLORS.eye, roughness: 0.35 }),
    pupil:     new MeshStandardMaterial({ color: COLORS.pupil, roughness: 0.3 }),
    outline:   new MeshBasicMaterial({ color: COLORS.outline, side: BackSide }),
    hit:       new MeshBasicMaterial({ visible: false }),
    spark:     new MeshBasicMaterial({ color: COLORS.outline }),
    sparkAlt:  new MeshBasicMaterial({ color: '#ffffff' }),
  };

  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly gaze = new Vector3();
  private readonly gazeGoal = new Vector3();
  private readonly reduceMotion: boolean;

  private tweens: Tween[] = [];
  private raf = 0;
  private running = false;
  private disposed = false;
  private lastFrame = 0;
  private nextBlink = 0;

  private interactive = false;
  private hovered = -1;
  private armed = -1;
  private focusIndex = -1;
  private keyboardFocus = false;
  private pointer = new Vector2();  // -1..1 over the canvas, drives a little parallax
  private pointerSmooth = new Vector2();

  private mood: 'open' | 'closing' | 'closed' = 'closed';
  private jawAngle = 0;
  private tremble = 0;
  private bounce = 0;
  private squash = 0;
  private shake = 0;
  private lidBase = 0;
  private blink = 0;

  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;

  constructor(container: HTMLElement, options: KrokodilSceneOptions) {
    this.container = container;
    this.options = options;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Throws when WebGL is unavailable; the widget shows a message instead.
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Krokodillens munn. Klikk på en tann, eller bruk piltastene og Enter.');
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', outline: 'none', touchAction: 'manipulation' });
    container.appendChild(this.canvas);

    this.buildLights();
    this.buildCroc();
    this.scene.add(this.root);
    this.upperJaw.rotation.x = 0;
    this.gaze.copy(this.camera.position);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('focus', this.handleFocus);
    this.canvas.addEventListener('blur', this.handleBlur);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    // Only animate while the widget is on screen.
    this.intersectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible) this.start(); else this.stop();
    });
    this.intersectionObserver.observe(container);
    this.start();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setInteractive(on: boolean) {
    this.interactive = on;
    if (!on) {
      this.hovered = -1;
      this.armed = -1;
    } else if (this.focusIndex >= 0 && this.teeth[this.focusIndex].pressed) {
      this.focusIndex = this.nextStanding(this.focusIndex, 1);
    }
    this.updateCursor();
  }

  /** Sinks a tooth into the gum. */
  async pressTooth(index: number): Promise<void> {
    const tooth = this.teeth[index];
    if (!tooth || tooth.pressed) return;
    tooth.pressed = true;
    tooth.mesh.material = this.materials.toothUsed;
    if (this.hovered === index) this.hovered = -1;
    await this.tween(170, (k) => { tooth.sink = k; }, easeOutCubic);
  }

  /** A nervous twitch of the upper jaw after a safe tooth. Sometimes a big fake-out. */
  flinch() {
    if (this.mood !== 'open') return;
    const amount = Math.random() < 0.18 ? 0.2 : 0.05 + Math.random() * 0.04;
    void this.tween(Math.round(240 + amount * 600), (k) => { this.jawAngle = OPEN_ANGLE - Math.sin(k * Math.PI) * amount; }, linear);
  }

  /** Winds up, slams the mouth shut, bounces and settles with a smug look. */
  async slam(): Promise<void> {
    this.setInteractive(false);
    this.mood = 'closing';
    const from = this.jawAngle;
    await Promise.all([
      this.tween(340, (k) => { this.jawAngle = from + (WINDUP_ANGLE - from) * k; }, easeOutCubic),
      this.tween(340, (k) => { this.tremble = k; }, easeInQuad),
    ]);
    await this.tween(120, (k) => { this.jawAngle = WINDUP_ANGLE * (1 - k); }, easeInCubic);
    this.jawAngle = 0;
    this.tremble = 0;
    this.mood = 'closed';
    this.burst();
    if (!this.reduceMotion) navigator.vibrate?.(180);
    void this.tween(260, (k) => { this.lidBase = 0.52 * k; }, easeOutCubic, 280);
    await this.tween(700, (k) => {
      const decay = (1 - k) ** 2;
      this.bounce = Math.abs(Math.sin(k * Math.PI * 3)) * decay * 0.18;
      this.squash = Math.sin(k * Math.PI * 4) * decay;
      this.shake  = this.reduceMotion ? 0 : decay;
    }, linear);
    this.bounce = 0;
    this.squash = 0;
    this.shake = 0;
  }

  /** Opens the mouth (with a little yawn overshoot) and pops all the teeth back up. */
  async reopen(): Promise<void> {
    this.setInteractive(false);
    const from = this.jawAngle;
    const lidFrom = this.lidBase;
    void this.tween(220, (k) => { this.lidBase = lidFrom * (1 - k); });
    const jaw = this.tween(780, (k) => { this.jawAngle = from + (OPEN_ANGLE - from) * k; }, easeOutBack);
    const teeth = this.teeth.map((tooth, i) => {
      if (!tooth.pressed) return Promise.resolve();
      tooth.pressed = false;
      tooth.mesh.material = this.materials.tooth;
      const start = tooth.sink;
      return this.tween(340, (k) => { tooth.sink = start * (1 - k); }, easeOutBack, 260 + i * 35);
    });
    await Promise.all([jaw, ...teeth]);
    this.jawAngle = OPEN_ANGLE;
    this.mood = 'open';
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('focus', this.handleFocus);
    this.canvas.removeEventListener('blur', this.handleBlur);
    // Let anyone awaiting an animation carry on (they check whether the scene is still current).
    for (const tw of this.tweens) tw.done();
    this.tweens = [];
    const geometries = new Set<BufferGeometry>();
    this.scene.traverse((obj) => { if (obj instanceof Mesh) geometries.add(obj.geometry); });
    geometries.forEach((g) => g.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ── Building the croc ───────────────────────────────────────────────────────

  private buildLights() {
    this.scene.add(new HemisphereLight('#ffffff', '#5d7a4f', 1.9));
    const sun = new DirectionalLight('#fff3dc', 2.4);
    sun.position.set(3.5, 7, 5);
    sun.target.position.set(0, 0, 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
    this.scene.add(sun, sun.target);
    const rim = new DirectionalLight('#d8ecff', 0.8);
    rim.position.set(-4, 3, -5);
    // Soft light from the viewer's side, so the palate isn't lost in shadow.
    const fill = new DirectionalLight('#ffe6ee', 1.1);
    fill.position.set(2, 0.5, 9);
    this.scene.add(rim, fill);

    // Transparent ground that only shows the croc's shadow, so the widget's own background shows through.
    const ground = new Mesh(new PlaneGeometry(14, 14), new ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private buildCroc() {
    const m = this.materials;
    const lowerShape = snoutShape();
    const upperShape = snoutShape(1.06, 1.03);

    // Lower jaw: pink mouth floor on top (caps), green sides.
    const lower = new Mesh(slab(lowerShape, 0.42, 0), [m.mouth, m.skin]);
    lower.castShadow = lower.receiveShadow = true;
    this.root.add(lower);

    const tongue = blob(1, 1, m.tongue, [0.6, 0.12, 1.05], [0, 0.02, 1.55]);
    tongue.receiveShadow = true;
    const throat = blob(1, 1, m.throat, [0.95, 0.5, 0.35], [0, 0.12, 0.02]);
    this.root.add(tongue, throat);

    // Lower teeth: the playable ones.
    const toothGeo = new ConeGeometry(0.15, 0.42, 6);
    toothGeo.translate(0, 0.21, 0);
    const hullGeo = new ConeGeometry(0.28, 0.66, 6);
    hullGeo.translate(0, 0.19, 0);
    const proxyGeo = new CylinderGeometry(0.27, 0.27, 0.66, 8);
    proxyGeo.translate(0, 0.24, 0);
    slotsAlong(lowerShape, 0.24, 0.7, TOOTH_COUNT).forEach((slot, index) => {
      const socket = new Group();
      socket.position.set(slot.x, 0, slot.z);
      leanOut(socket, slot.ox, slot.oz, 0.18);
      const mesh = new Mesh(toothGeo, m.tooth);
      mesh.userData.toothIndex = index;
      mesh.castShadow = true;
      const hull = new Mesh(hullGeo, m.outline);
      hull.visible = false;
      mesh.add(hull);
      const proxy = new Mesh(proxyGeo, m.hit);
      proxy.userData.toothIndex = index;
      socket.add(mesh, proxy);
      this.root.add(socket);
      this.teeth.push({ mesh, hull, proxy, pressed: false, sink: 0, lift: 0 });
    });

    // Upper jaw: hinges at the origin. Green all over, with a pink palate underneath.
    const upper = new Mesh(slab(upperShape, 0.38, 0.58), m.skin);
    upper.castShadow = true;
    const palate = new Mesh(new ShapeGeometry(snoutShape(0.92, 0.97), 6), m.palate);
    palate.geometry.rotateX(Math.PI / 2); // faces down
    palate.position.y = -0.005;
    this.upperJaw.add(upper, palate);

    const upperToothGeo = new ConeGeometry(0.11, 0.3, 5);
    upperToothGeo.rotateX(Math.PI);
    upperToothGeo.translate(0, -0.13, 0);
    for (const slot of slotsAlong(upperShape, 0.16, 0.95, 12)) {
      const tooth = new Mesh(upperToothGeo, m.tooth);
      tooth.position.set(slot.x, 0, slot.z);
      leanOut(tooth, -slot.ox, -slot.oz, 0.15);
      tooth.castShadow = true;
      this.upperJaw.add(tooth);
    }

    // Nostrils and a few bumps along the snout.
    for (const x of [-0.26, 0.26]) this.upperJaw.add(blob(0.13, 0, m.skinDark, [1, 0.7, 1], [x, 0.6, 3.5]));
    for (const [x, z] of [[-0.35, 1.5], [0.4, 1.9], [-0.15, 2.4], [0.25, 1.1], [-0.45, 2.0]]) {
      this.upperJaw.add(blob(0.1, 0, m.skinDark, [1, 0.6, 1.2], [x, 0.6, z]));
    }

    // Eyes sit on bumps at the back of the upper jaw.
    for (const side of [-1, 1]) {
      const bump = blob(0.4, 1, m.skin, [1, 0.8, 1], [side * 1.04, 0.6, 0.28]);
      bump.castShadow = true;
      this.upperJaw.add(bump);

      const group = new Group();
      group.position.set(side * 1.1, 1.06, 0.4);
      const ball = new Mesh(new SphereGeometry(0.34, 16, 12), m.eye);
      const pupil = new Mesh(new SphereGeometry(0.16, 12, 10), m.pupil);
      pupil.position.z = 0.27;
      pupil.scale.set(1, 1.15, 0.45);
      const glint = new Mesh(new SphereGeometry(0.035, 8, 6), m.eye);
      glint.position.set(0.055, 0.07, 0.33);
      // The lid must clear the pupil and glint (both reach ~0.38 from the centre) or they poke through it.
      const lid = new Mesh(new SphereGeometry(0.395, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.skin);
      lid.rotation.x = -Math.PI / 2;
      group.add(ball, pupil, glint, lid);
      this.upperJaw.add(group);
      this.eyes.push({ group, lid });
    }

    this.upperJaw.traverse((obj) => { if (obj instanceof Mesh) this.occluders.push(obj); });
    this.root.add(this.upperJaw);

    // Head, body, legs and tail behind the jaws.
    const head = blob(1, 1, m.skin, [1.32, 0.78, 1.05], [0, 0.04, -0.42]);
    const cheeks = [-1, 1].map((side) => blob(0.42, 1, m.skin, [0.8, 1, 1], [side * 1.12, 0.12, 0.12]));
    const body = blob(1, 1, m.skin, [1.5, 0.74, 2.3], [0, 0.12, -2.35]);
    const belly = blob(1, 1, m.belly, [1.35, 0.4, 2.0], [0, -0.22, -2.3]);
    for (const mesh of [head, body, ...cheeks]) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.root.add(head, body, belly, ...cheeks);

    for (let z = -0.95; z > -4.1; z -= 0.42) {
      for (const x of [-0.38, 0.38]) {
        const t = (z + 2.35) / 2.3;
        const y = 0.12 + 0.74 * Math.sqrt(Math.max(0, 1 - t * t - (x / 1.5) ** 2)) - 0.04;
        if (z > -1.2) continue; // the head covers the first row
        const scute = new Mesh(new ConeGeometry(0.15, 0.26, 4), m.skinDark);
        scute.position.set(x, y + 0.08, z);
        scute.castShadow = true;
        this.root.add(scute);
      }
    }

    for (const [side, z] of [[-1, -0.8], [1, -0.8], [-1, -3.2], [1, -3.2]] as const) {
      const leg = new Mesh(new CylinderGeometry(0.24, 0.3, 0.6, 6), m.skin);
      leg.position.set(side * 1.42, -0.22, z);
      leg.rotation.z = side * -0.5;
      const foot = blob(0.32, 0, m.skin, [1.15, 0.45, 1.35], [side * 1.62, GROUND_Y + 0.1, z + 0.18]);
      leg.castShadow = foot.castShadow = true;
      this.root.add(leg, foot);
      for (const t of [-0.16, 0, 0.16]) {
        this.root.add(blob(0.09, 0, m.skinDark, [1, 0.8, 1.2], [side * 1.62 + t, GROUND_Y + 0.08, z + 0.58 - Math.abs(t) * 0.5]));
      }
    }

    this.tail.position.set(0, 0.05, -4.3);
    let tailZ = 0;
    for (let i = 0; i < 5; i++) {
      const r = 0.62 - i * 0.11;
      const seg = blob(1, 1, m.skin, [r * 1.1, r * 0.75, 0.75], [0.12 * i * i * 0.4, -i * 0.05, tailZ]);
      seg.castShadow = true;
      this.tail.add(seg);
      tailZ -= 0.62;
    }
    this.root.add(this.tail);
  }

  // ── Loop ────────────────────────────────────────────────────────────────────

  private start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tween(duration: number, update: (k: number) => void, ease: Ease = easeOutCubic, delay = 0): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      this.tweens.push({ start: performance.now() + delay, duration, ease, update, done: resolve });
    });
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    const active = this.tweens;
    this.tweens = [];
    for (const tw of active) {
      const t = (now - tw.start) / tw.duration;
      if (t < 0) { this.tweens.push(tw); continue; }
      tw.update(tw.ease(Math.min(t, 1)));
      if (t >= 1) tw.done(); else this.tweens.push(tw);
    }

    const s = now / 1000;
    const idle = this.mood === 'open' && this.interactive;

    // Jaw: tweened angle + idle sway + nervous tremble + post-slam bounce.
    const sway = idle ? Math.sin(s * 1.7) * 0.015 : 0;
    const jitter = this.tremble * (Math.sin(now * 0.09) * 0.6 + Math.sin(now * 0.153) * 0.4) * 0.03;
    this.upperJaw.rotation.x = -(this.jawAngle + sway + jitter + this.bounce);

    // Breathing, impact squash and the shiver before the slam.
    const breathe = Math.sin(s * 1.6) * 0.012;
    this.root.position.set(this.tremble * Math.sin(now * 0.11) * 0.03, breathe, 0);
    this.root.scale.set(1 + this.squash * 0.05, 1 - this.squash * 0.09, 1 + this.squash * 0.04);
    this.tail.rotation.y = Math.sin(s * 1.1) * 0.18;

    // Teeth: hover lift and sinking.
    const highlighted = this.highlighted();
    this.teeth.forEach((tooth, i) => {
      const goal = i === highlighted ? 1 : 0;
      tooth.lift += (goal - tooth.lift) * (1 - Math.exp(-dt * 18));
      tooth.mesh.position.y = tooth.lift * 0.08 - tooth.sink * SINK_DEPTH;
      tooth.hull.visible = i === highlighted;
      if (!tooth.pressed) tooth.mesh.material = i === highlighted ? this.materials.toothHot : this.materials.tooth;
    });

    this.updateEyes(now, dt, highlighted);
    this.updateParticles(now, dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private updateEyes(now: number, dt: number, highlighted: number) {
    if (now > this.nextBlink && this.mood !== 'closing') {
      this.nextBlink = now + 2200 + Math.random() * 3200;
      void this.tween(170, (k) => { this.blink = Math.sin(k * Math.PI); }, linear);
    }
    if (highlighted >= 0 && this.mood === 'open') {
      this.teeth[highlighted].mesh.getWorldPosition(this.gazeGoal);
    } else {
      this.gazeGoal.copy(this.camera.position);
    }
    this.gaze.lerp(this.gazeGoal, 1 - Math.exp(-dt * 9));
    const lid = Math.max(this.lidBase, this.blink);
    for (const eye of this.eyes) {
      eye.group.lookAt(this.gaze);
      eye.lid.rotation.x = -Math.PI / 2 + lid * Math.PI;
    }
  }

  private burst() {
    if (this.reduceMotion) return;
    const geo = new TetrahedronGeometry(0.09, 0);
    for (let i = 0; i < 16; i++) {
      const mesh = new Mesh(geo, i % 3 ? this.materials.spark : this.materials.sparkAlt);
      mesh.position.set((Math.random() - 0.5) * 1.6, 0.35, 3.2 + Math.random() * 0.5);
      const angle = Math.random() * Math.PI * 2;
      const vel = new Vector3(Math.cos(angle) * 3, 3 + Math.random() * 2.5, Math.sin(angle) * 2 + 1.5);
      const spin = new Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, spin, born: performance.now() });
    }
  }

  private updateParticles(now: number, dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const age = (now - p.born) / 750;
      if (age >= 1) {
        this.scene.remove(p.mesh);
        if (!this.particles.some((q, j) => j !== i && q.mesh.geometry === p.mesh.geometry)) p.mesh.geometry.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.scale.setScalar(1 - age * age);
    }
  }

  private updateCamera(dt: number) {
    if (!this.reduceMotion) this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 4));
    // Tall, narrow stages (the StreamDeck) get a more head-on, closer view so the mouth fills the width.
    const narrow = Math.min(1, Math.max(0, (1.2 - this.camera.aspect) / 0.6));
    const az = VIEW_AZIMUTH - narrow * 0.2 + this.pointerSmooth.x * 0.08;
    const el = VIEW_ELEVATION - this.pointerSmooth.y * 0.03;
    const dist = this.fitDistance() * (1 - narrow * 0.12);
    this.camera.position.set(
      VIEW_TARGET.x + Math.sin(az) * Math.cos(el) * dist,
      VIEW_TARGET.y + Math.sin(el) * dist,
      VIEW_TARGET.z + Math.cos(az) * Math.cos(el) * dist,
    );
    this.camera.lookAt(VIEW_TARGET);
    if (this.shake > 0) {
      const a = this.shake * 0.1;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
  }

  private fitDistance() {
    const vHalf = (FOV * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    return FIT_RADIUS / Math.sin(Math.min(vHalf, hHalf));
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private highlighted() {
    if (!this.interactive) return -1;
    if (this.hovered >= 0) return this.hovered;
    return this.keyboardFocus ? this.focusIndex : -1;
  }

  private pick(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    // A tooth itself wins; the larger hit areas only count where no tooth was hit,
    // since neighbouring hit areas overlap when the jaw is seen from the side.
    const standing = this.teeth.filter((t) => !t.pressed);
    for (const layer of [standing.map((t) => t.mesh), standing.map((t) => t.proxy)]) {
      const index = this.raycaster.intersectObjects([...this.occluders, ...layer], false)[0]?.object.userData.toothIndex;
      if (typeof index === 'number') return index;
    }
    return -1;
  }

  private updateCursor() {
    this.canvas.style.cursor = this.interactive && this.hovered >= 0 ? 'pointer' : 'default';
  }

  private press(index: number) {
    if (!this.interactive || index < 0 || this.teeth[index].pressed) return;
    this.options.onToothPress(index);
  }

  private nextStanding(from: number, step: 1 | -1): number {
    for (let i = 1; i <= TOOTH_COUNT; i++) {
      const idx = (((from + step * i) % TOOTH_COUNT) + TOOTH_COUNT) % TOOTH_COUNT;
      if (!this.teeth[idx].pressed) return idx;
    }
    return -1;
  }

  private handlePointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1);
    if (e.pointerType === 'touch') return;
    this.hovered = this.interactive ? this.pick(e.clientX, e.clientY) : -1;
    if (this.hovered >= 0) this.focusIndex = this.hovered;
    this.updateCursor();
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (!this.interactive) return;
    this.armed = this.pick(e.clientX, e.clientY);
    if (e.pointerType === 'touch') this.hovered = this.armed;
  };

  private handlePointerUp = (e: PointerEvent) => {
    const index = this.pick(e.clientX, e.clientY);
    const armed = this.armed;
    this.armed = -1;
    if (e.pointerType === 'touch') this.hovered = -1;
    if (index >= 0 && index === armed) this.press(index);
  };

  private handlePointerLeave = () => {
    this.hovered = -1;
    this.armed = -1;
    this.pointer.set(0, 0);
    this.updateCursor();
  };

  private handleFocus = () => {
    this.keyboardFocus = this.canvas.matches(':focus-visible');
    if (this.focusIndex < 0 || this.teeth[this.focusIndex]?.pressed) this.focusIndex = this.nextStanding(Math.floor(TOOTH_COUNT / 2) - 1, 1);
  };

  private handleBlur = () => { this.keyboardFocus = false; };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.interactive) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.keyboardFocus = true;
      this.hovered = -1;
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      this.focusIndex = this.nextStanding(this.focusIndex < 0 ? 0 : this.focusIndex, step);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.keyboardFocus = true;
      this.press(this.focusIndex);
    }
  };
}

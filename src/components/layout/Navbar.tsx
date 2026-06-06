import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { triggerMeow, consumeCatSuppression } from '@/services/meow';
import { config } from '@/config';
import { THEME_GROUPS, ALL_THEMES } from '@/config/themes';

// ── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function BackArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.41 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}
function ChatBubbleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function CalendarNavIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
function BusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6v6M16 6v6M2 12h19.6M18 18h3s.5-1.7.8-4.3c.3-2.7.4-4.7.4-4.7H2s.2 2 .5 4.7C2.8 16.3 3.3 18 3.3 18H6"/>
      <circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/>
    </svg>
  );
}
function FilmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  );
}
function SpinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16M8 22V12M16 22V12"/>
      <path d="M6 4h12v8a6 6 0 0 1-12 0V4z"/>
    </svg>
  );
}
function LampIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}
function PigIcon() {
  return <img src="/images/pigs/labber.gif" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />;
}

function QuoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  );
}
function MjauIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function GnomLogo({ size = 28, style }: { size?: number; style?: React.CSSProperties }) {
  const w = size * (140 / 209);
  return (
    <svg width={w} height={size} viewBox="0 0 140 209" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={style}>
      <path d="M65.5885 3.01814C67.3259 -1.00605 73.032 -1.00604 74.7694 3.01815L139.526 153.009C141.134 156.734 137.869 160.723 133.899 159.882L74.3232 147.263C71.5907 146.685 68.7672 146.685 66.0347 147.263L6.45875 159.882C2.48902 160.723 -0.776153 156.734 0.832247 153.009L65.5885 3.01814Z" fill="currentColor"/>
      <path d="M0 198.339C0 186.595 7.16489 176.039 18.0795 171.703C29.8724 167.019 43.0447 167.218 54.69 172.259L66.057 177.179C68.5744 178.269 71.4289 178.276 73.9521 177.2L85.9455 172.085C97.5049 167.156 110.55 167.024 122.206 171.719C132.958 176.049 140 186.477 140 198.068V208.886H0V198.339Z" fill="currentColor"/>
      <path d="M70 174.386C78.2843 174.386 85 168.79 85 161.886C85 154.982 78.2843 149.386 70 149.386C61.7157 149.386 55 154.982 55 161.886C55 168.79 61.7157 174.386 70 174.386Z" fill="currentColor"/>
    </svg>
  );
}

// ── Nav data ────────────────────────────────────────────────────────────────

type NavItem    = { to: string; label: string; Icon: () => JSX.Element };
type NavSection = { heading: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Navigasjon',
    items: [
      { to: '/',         label: 'Home',           Icon: HomeIcon },
      { to: '/',         label: 'Call',           Icon: PhoneIcon },
      { to: '/chat',     label: 'Chat',           Icon: ChatBubbleIcon },
      { to: '/calendar', label: 'Calendar',       Icon: CalendarNavIcon },
      { to: '/sitater',  label: 'Sitater',        Icon: QuoteIcon },
      { to: '/archive',  label: 'Arkiv',          Icon: ArchiveIcon },
    ],
  },
  {
    heading: 'Gnomoseum',
    items: [
      { to: '/turnering', label: 'Turnering', Icon: TrophyIcon },
    ],
  },
  {
    heading: 'Tjenester',
    items: [
      { to: '/galleri',  label: 'Galleri',        Icon: ImageIcon },
      { to: '/buss',     label: 'Buss',           Icon: BusIcon },
      { to: '/kino',     label: 'Kino',           Icon: FilmIcon },
    ],
  },
  {
    heading: 'Prosjekter',
    items: [
      { to: '/spin',   label: 'Spin the Wheel', Icon: SpinIcon },
      { to: '/kast-grisene', label: 'Kast grisene', Icon: PigIcon },
      { to: '/lampa',  label: 'Lampa til Jens', Icon: LampIcon },
    ],
  },
];

// ── Hamburger icon ──────────────────────────────────────────────────────────

function MenuIcon({ open, size = 18 }: { open: boolean; size?: number }) {
  const ref1 = useRef<SVGLineElement>(null);
  const ref2 = useRef<SVGLineElement>(null);
  const initialized = useRef(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    if (prevOpen.current === open) return;
    prevOpen.current = open;
    const lines = [ref1.current, ref2.current];
    const names = open
      ? ['menu-line-top-open', 'menu-line-bot-open']
      : ['menu-line-top-close', 'menu-line-bot-close'];
    lines.forEach((el, i) => {
      if (!el) return;
      el.style.animation = 'none';
      void el.getBoundingClientRect();
      el.style.animation = `${names[i]} 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards`;
    });
  }, [open]);

  return (
    <svg width="28" height={size} viewBox="0 0 28 18" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line ref={ref1} x1="0" y1="4" x2="28" y2="4" style={{ transformOrigin: '14px 4px' }} />
      <line ref={ref2} x1="0" y1="13" x2="28" y2="13" style={{ transformOrigin: '14px 13px' }} />
    </svg>
  );
}

// ── Navbar ──────────────────────────────────────────────────────────────────

type OverlayView = 'profile' | 'themes';
type CatPhase    = 'hidden' | 'rising' | 'meowing' | 'closing' | 'falling';

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();

  // Hamburger
  const [menuOpen, setMenuOpen]       = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [catPhase, setCatPhase]       = useState<CatPhase>('hidden');
  const catPhaseRef                   = useRef<CatPhase>('hidden');
  const catTimers                     = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Unified profile/theme overlay
  const [overlayOpen, setOverlayOpen]           = useState(false);
  const [overlayFadingOut, setOverlayFadingOut] = useState(false);
  const [view, setView]                         = useState<OverlayView>('profile');
  const [prevView, setPrevView]                 = useState<OverlayView | null>(null);
  const [openedFromMenu, setOpenedFromMenu]     = useState(false);

  // Search
  const [hamburgerSearch, setHamburgerSearch] = useState('');
  const [profileSearch,   setProfileSearch]   = useState('');
  const [themeSearch,     setThemeSearch]     = useState('');

  const navRef             = useRef<HTMLElement>(null);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const hamburgerSearchRef = useRef<HTMLInputElement>(null);
  const profileSearchRef   = useRef<HTMLInputElement>(null);
  const themeSearchRef     = useRef<HTMLInputElement>(null);

  const meowActive       = catPhase !== 'hidden';
  const displayName      = user?.name?.trim() || user?.email?.trim() || 'Unknown user';
  const currentThemeLabel = ALL_THEMES.find(t => t.id === theme)?.label ?? theme;

  function setPhase(p: CatPhase) {
    catPhaseRef.current = p;
    setCatPhase(p);
  }

  function clearCatTimers() {
    catTimers.current.forEach(clearTimeout);
    catTimers.current = [];
  }

  // Mjau SSE
  useEffect(() => {
    audioRef.current = new Audio('/mjau.wav');
    const token  = useAuthStore.getState().token ?? '';
    const source = new EventSource(`/app-api/meow/events?token=${encodeURIComponent(token)}`);
    source.onmessage = () => {
      audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play().catch(() => {}));
      if (consumeCatSuppression()) return;
      clearCatTimers();

      const alreadyUp = catPhaseRef.current !== 'hidden' && catPhaseRef.current !== 'falling';

      if (alreadyUp) {
        // Spam: flash mouth and reset the slide-down countdown
        setPhase('meowing');
        catTimers.current.push(setTimeout(() => setPhase('closing'), 120));
        catTimers.current.push(setTimeout(() => setPhase('falling'), 220));
        catTimers.current.push(setTimeout(() => setPhase('hidden'),  570));
      } else {
        // Fresh appearance: full slide-up sequence
        setPhase('rising');
        catTimers.current.push(setTimeout(() => setPhase('meowing'), 350));
        catTimers.current.push(setTimeout(() => setPhase('closing'), 1200));
        catTimers.current.push(setTimeout(() => setPhase('falling'), 1350));
        catTimers.current.push(setTimeout(() => setPhase('hidden'),  1750));
      }
    };
    return () => { source.close(); clearCatTimers(); };
  }, []);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (overlayOpen) closeOverlay();
      else if (menuOpen) closeMenu();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, overlayOpen]);

  // Intentionally only fires on pathname change
  useEffect(() => {
    if (menuOpen && !openedFromMenu) closeMenu();
    if (overlayOpen) closeOverlay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function closeMenu()    { setMenuClosing(true); setHamburgerSearch(''); }
  function closeOverlay() {
    setOverlayFadingOut(true);
    if (openedFromMenu) {
      // hamburger is still open behind the overlay — close it instantly
      setMenuOpen(false);
      setMenuClosing(false);
      setHamburgerSearch('');
      setOpenedFromMenu(false);
    }
  }

  function openOverlay(v: OverlayView) {
    setView(v);
    setPrevView(null);
    setOverlayOpen(true);
    setOverlayFadingOut(false);
  }

  function switchToThemes() {
    setPrevView('profile');
    setView('themes');
    setProfileSearch('');
  }

  function switchToProfile() {
    setPrevView('themes');
    setView('profile');
    setThemeSearch('');
  }

  function openProfileFromMenu() {
    setHamburgerSearch('');
    setOpenedFromMenu(true);
    openOverlay('profile');
  }

  function toggleMenu() {
    if (overlayOpen) { closeOverlay(); return; }
    if (menuOpen && !menuClosing) closeMenu();
    else if (!menuOpen) setMenuOpen(true);
  }

  function toggleProfile() {
    if (menuOpen && !menuClosing) {
      // open profile on top of hamburger, close hamburger after fade-in
      setOpenedFromMenu(true);
      openOverlay('profile');
      return;
    }
    if (overlayOpen) {
      if (view === 'themes') switchToProfile();
      else closeOverlay();
    } else {
      openOverlay('profile');
    }
  }

  function onPanelAnimationEnd() {
    if (menuClosing) { setMenuClosing(false); setMenuOpen(false); }
  }

  function onOverlayAnimationEnd(e: React.AnimationEvent) {
    if (e.target !== e.currentTarget) return;
    if (overlayFadingOut) {
      setOverlayFadingOut(false);
      setOverlayOpen(false);
      setView('profile');
      setPrevView(null);
      setProfileSearch('');
      setThemeSearch('');
      setOpenedFromMenu(false);
    } else if (openedFromMenu) {
      // profile finished fading in over hamburger — close hamburger invisibly
      setMenuOpen(false);
      setMenuClosing(false);
      setHamburgerSearch('');
    }
  }

  function onPrevContentAnimationEnd(e: React.AnimationEvent) {
    if (e.target !== e.currentTarget) return;
    setPrevView(null);
  }

  // Filtered nav sections
  const q = hamburgerSearch.toLowerCase();
  const filteredSections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q)) }))
    .filter(s => s.items.length > 0 || !q);

  // Filtered theme groups
  const tq = themeSearch.toLowerCase();
  const filteredPickerGroups = THEME_GROUPS.map(g => ({
    ...g,
    themes: g.themes.filter(t =>
      t.label.toLowerCase().includes(tq) || t.description.toLowerCase().includes(tq)
    ),
  })).filter(g => g.themes.length > 0);

  return (
    <div ref={navRef as React.RefObject<HTMLDivElement>} style={{ position: 'relative', zIndex: 50 }}>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <nav className="flex items-center px-4 sm:px-8 h-16 sm:h-20 flex-shrink-0">
        <div className="flex-1">
          <Link to="/" className="inline-flex items-center gap-2 text-4xl font-bold text-foreground" style={{ textDecoration: 'none' }}>
            {config.appTitle}
            <GnomLogo size={25} />
          </Link>
        </div>

        <ul className="hidden lg:flex items-center justify-around flex-1 list-none" style={{ transform: 'translateY(5px)' }}>
          {[{ to: '/', label: 'Call' }, { to: '/chat', label: 'Chat' }].map(item => (
            <li key={item.to}>
              <Link to={item.to} className="relative px-4 text-2xl font-medium text-foreground flex items-center" style={{ height: '24px', overflow: 'hidden' }}>
                {item.label}
                {location.pathname === item.to && item.to !== '/' && (
                  <span className="underline-grow absolute bottom-0 left-3 right-3 h-0.5 bg-current" />
                )}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => triggerMeow().catch(() => {})}
              className="relative px-4 text-2xl font-medium text-foreground transition-transform duration-150 flex items-center"
              style={{ transform: meowActive ? 'scale(1.15)' : 'scale(1)', height: '24px', overflow: 'hidden' }}
            >
              Mjau
              {meowActive && <span className="underline-grow absolute bottom-0 left-3 right-3 h-0.5 bg-current" />}
            </button>
          </li>
        </ul>

        <div className="flex items-center gap-4 flex-1 justify-end" style={{ position: 'relative', zIndex: 110 }}>
          {user && (
            <button
              onClick={toggleProfile}
              className="hidden sm:flex items-center justify-center p-1 rounded-full bg-transparent border border-foreground hover:bg-foreground/10 transition-colors cursor-pointer"
            >
              <Avatar src={vocechatService.avatarUrl(user.uid, user.avatarUpdatedAt)} name={displayName} size="md" />
            </button>
          )}
          <button
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 65, height: '25px', transform: 'translateY(-1px)' }}
            className="w-11 rounded text-foreground"
            onClick={toggleMenu}
          >
            <MenuIcon open={(menuOpen && !menuClosing) || (overlayOpen && !overlayFadingOut)} size={25} />
          </button>
        </div>
      </nav>

      {/* ── Hamburger overlay ───────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className={`fixed inset-0 bg-card flex flex-col ${menuClosing ? 'panel-drop-out' : 'panel-drop-in'}`}
          style={{ zIndex: 100 }}
          onAnimationEnd={onPanelAnimationEnd}
        >
          <div className="flex items-center gap-4 px-4 sm:px-8 h-16 sm:h-20">
            <span className="text-secondary-foreground flex-shrink-0"><SearchIcon /></span>
            <input
              ref={hamburgerSearchRef}
              value={hamburgerSearch}
              onChange={e => setHamburgerSearch(e.target.value)}
              placeholder="Hva leter du etter?"
              className="flex-1 bg-transparent text-foreground text-lg outline-none placeholder:text-secondary-foreground"
            />
            <div className="w-11 flex-shrink-0" />
          </div>
          <div className="border-t border-border" />
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-12">

            {/* Mobile profile card — above nav sections, only on small screens */}
            {user && (!q || displayName.toLowerCase().includes(q) || 'profil'.includes(q)) && (
              <div className="sm:hidden mb-8">
                <button
                  onClick={openProfileFromMenu}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-muted border border-border hover:brightness-95 transition-all text-left"
                >
                  <Avatar src={vocechatService.avatarUrl(user.uid, user.avatarUpdatedAt)} name={displayName} size="xl" />
                  <div className="min-w-0">
                    <p className="text-xl font-semibold text-foreground truncate">{displayName}</p>
                    {user.email && <p className="text-sm text-secondary-foreground truncate">{user.email}</p>}
                  </div>
                </button>
              </div>
            )}

            {filteredSections.length === 0 ? (
              <p className="text-secondary-foreground text-sm">Ingen resultater for «{hamburgerSearch}»</p>
            ) : (
              filteredSections.map(section => (
                <div key={section.heading} className="mb-8">
                  <h2 className="text-lg font-bold text-foreground mb-3">{section.heading}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                    {section.heading === 'Navigasjon' && (!q || 'mjau'.includes(q)) && (
                      <button
                        onClick={() => { triggerMeow().catch(() => {}); closeMenu(); }}
                        className="lg:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                      >
                        <span className="flex-shrink-0 text-secondary-foreground"><MjauIcon /></span>
                        Mjau
                      </button>
                    )}
                    {section.items.map(item => (
                      <Link
                        key={item.label}
                        to={item.to}
                        onClick={closeMenu}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                      >
                        <span className="flex-shrink-0 text-secondary-foreground"><item.Icon /></span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Unified profile / theme-picker overlay ──────────────────────────── */}
      {overlayOpen && (
        <div
          className={`fixed inset-0 bg-card flex flex-col ${overlayFadingOut ? 'panel-drop-out' : openedFromMenu ? 'panel-fade-in' : 'panel-drop-in'}`}
          style={{ zIndex: openedFromMenu ? 101 : 100 }}
          onAnimationEnd={onOverlayAnimationEnd}
        >
          {/* Search header */}
          <div className="flex items-center gap-4 px-4 sm:px-8 h-16 sm:h-20">
            {view === 'themes' ? (
              <button
                onClick={switchToProfile}
                className="text-foreground hover:text-accent transition-colors flex-shrink-0"
                title="Back to profile"
              >
                <BackArrowIcon />
              </button>
            ) : (
              <span className="text-secondary-foreground flex-shrink-0"><SearchIcon /></span>
            )}
            <input
              ref={view === 'themes' ? themeSearchRef : profileSearchRef}
              value={view === 'themes' ? themeSearch : profileSearch}
              onChange={e => view === 'themes'
                ? setThemeSearch(e.target.value)
                : setProfileSearch(e.target.value)
              }
              placeholder="Hva leter du etter?"
              className="flex-1 bg-transparent text-foreground text-lg outline-none placeholder:text-secondary-foreground"
            />
            <div className="w-11 flex-shrink-0" />
          </div>
          <div className="border-t border-border" />

          {/* Content — cross-fades between views, overlay stays solid */}
          <div className="flex-1 relative overflow-hidden">

            {/* Profile content — shown when active or fading out */}
            {(view === 'profile' || prevView === 'profile') && (
              <div
                className={`absolute inset-0 overflow-y-auto px-6 py-8 sm:px-12 ${prevView === 'profile' ? 'panel-fade-out' : prevView === 'themes' ? 'panel-fade-in' : ''}`}
                onAnimationEnd={prevView === 'profile' ? onPrevContentAnimationEnd : undefined}
              >
                <div className="hidden sm:block mb-8">
                  <h2 className="text-lg font-bold text-foreground mb-3">Profil</h2>
                  <div className="flex items-center gap-4">
                    <Avatar src={vocechatService.avatarUrl(user!.uid, user!.avatarUpdatedAt)} name={displayName} size="xl" />
                    <div>
                      <p className="text-xl font-semibold text-foreground">{displayName}</p>
                      {user?.email && <p className="text-base text-secondary-foreground">{user.email}</p>}
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h2 className="text-lg font-bold text-foreground mb-3">Tema</h2>
                  <button
                    onClick={switchToThemes}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                  >
                    <span className="flex-shrink-0 text-secondary-foreground"><PaletteIcon /></span>
                    {currentThemeLabel}
                    <span className="text-secondary-foreground text-base font-normal">— Bytt tema</span>
                  </button>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-foreground mb-3">Konto</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                    <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium">
                      <span className="flex-shrink-0 text-secondary-foreground"><SettingsIcon /></span>
                      Kontoinnstillinger
                    </button>
                    <button
                      onClick={() => { logout(); closeOverlay(); }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                    >
                      <span className="flex-shrink-0 text-secondary-foreground"><LogoutIcon /></span>
                      Logg ut
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Theme picker content — shown when active or fading out */}
            {(view === 'themes' || prevView === 'themes') && (
              <div
                className={`absolute inset-0 overflow-y-auto px-6 py-8 sm:px-12 ${prevView === 'themes' ? 'panel-fade-out' : prevView === 'profile' ? 'panel-fade-in' : ''}`}
                onAnimationEnd={prevView === 'themes' ? onPrevContentAnimationEnd : undefined}
              >
                <h2 className="text-lg font-bold text-foreground mb-6">Tema</h2>
                {filteredPickerGroups.length === 0 ? (
                  <p className="text-secondary-foreground text-sm">No themes match «{themeSearch}»</p>
                ) : (
                  filteredPickerGroups.map(group => (
                    <div key={group.label} className="mb-8">
                      {THEME_GROUPS.length > 1 && (
                        <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-3">
                          {group.label}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                        {group.themes.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={[
                              'flex flex-col px-3 py-2.5 rounded-lg transition-colors text-xl font-medium text-left',
                              theme === t.id ? 'text-accent bg-accent/10' : 'text-foreground hover:bg-muted',
                            ].join(' ')}
                          >
                            {t.label}
                            <span className="text-xs text-secondary-foreground font-normal">{t.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Mjau cat ───────────────────────────────────────────────────────── */}
      <div
        style={{
          position:       'fixed',
          bottom:         0,
          left:           '50%',
          transform:      `translateX(-50%) translateY(${catPhase === 'hidden' || catPhase === 'falling' ? '110%' : '0%'})`,
          transition:     catPhase === 'rising' || catPhase === 'falling' ? 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          zIndex:         300,
          pointerEvents:  'none',
        }}
      >
        <img
          src={catPhase === 'meowing' ? '/images/cat/nom_cat_mouth_open.png' : '/images/cat/nom_cat_mouth_closed.png'}
          alt=""
          style={{ width: 'min(80vw, 500px)', display: 'block' }}
        />
      </div>
    </div>
  );
}

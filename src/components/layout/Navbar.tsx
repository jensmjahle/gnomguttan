import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/store/themeStore';
import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { triggerMeow, consumeCatSuppression } from '@/services/meow';
import { config } from '@/config';
import { appLogoSrc } from '@/constants/assets';
import styles from './Navbar.module.css';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/chat', label: 'Chat' },
  { to: '/kino', label: 'Kino' },
  { to: '/buss', label: 'Buss' },
  { to: '/archive', label: 'Arkiv' },
];

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ── Navbar ──────────────────────────────────────────────────────────────────

type OverlayView = 'profile' | 'themes';
type CatPhase    = 'hidden' | 'rising' | 'meowing' | 'closing' | 'falling';

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useThemeStore();
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

  // Auto-focus search
  useEffect(() => {
    if (menuOpen && !menuClosing) setTimeout(() => hamburgerSearchRef.current?.focus(), 50);
  }, [menuOpen, menuClosing]);
  useEffect(() => {
    if (overlayOpen && !overlayFadingOut) {
      setTimeout(() => (view === 'themes' ? themeSearchRef : profileSearchRef).current?.focus(), 50);
    }
  }, [overlayOpen, view, overlayFadingOut]);

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
    } else if (openedFromMenu) {
      // profile finished fading in over hamburger — close hamburger invisibly
      setMenuOpen(false);
      setMenuClosing(false);
      setHamburgerSearch('');
      setOpenedFromMenu(false);
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
    .filter(s => s.items.length > 0);

  // Filtered theme groups
  const tq = themeSearch.toLowerCase();
  const filteredPickerGroups = THEME_GROUPS.map(g => ({
    ...g,
    themes: g.themes.filter(t =>
      t.label.toLowerCase().includes(tq) || t.description.toLowerCase().includes(tq)
    ),
  })).filter(g => g.themes.length > 0);

  return (
    <nav className={styles.navbar}>
      <div className={styles.brand}>
        <img className={styles.logo} src={appLogoSrc} alt="" aria-hidden="true" />
        <span className={styles.title}>{config.appTitle}</span>
      </div>

      <ul className={styles.navLinks}>
        {NAV_LINKS.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className={[styles.navLink, location.pathname === link.to ? styles.active : ''].filter(Boolean).join(' ')}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <button className={styles.iconBtn} onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {user && (
          <div className={styles.profile}>
            <Avatar
              src={vocechatService.avatarUrl(user.uid, user.avatarUpdatedAt)}
              name={displayName}
              size="sm"
            />
            <span className={styles.userName}>{displayName}</span>
          </div>
        )}

      {/* ── Unified profile / theme-picker overlay ──────────────────────────── */}
      {overlayOpen && (
        <div
          className={`fixed inset-0 bg-card flex flex-col ${overlayFadingOut ? 'panel-fade-out' : 'panel-fade-in'}`}
          style={{ zIndex: openedFromMenu ? 101 : 100 }}
          onAnimationEnd={onOverlayAnimationEnd}
        >
          {/* Search header */}
          <div className="flex items-center gap-4 px-8 h-24">
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
                <div className="mb-8">
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

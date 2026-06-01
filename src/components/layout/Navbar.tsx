import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { triggerMeow } from '@/services/meow';
import { config } from '@/config';
import type { Theme } from '@/types';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/chat', label: 'Chat' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/archive', label: 'Arkiv' },
];

const PROJECT_LINKS = [
  { to: '/spin', label: 'Spin the Wheel' },
  { to: '/lampa', label: 'Lampa til Jens' },
];

const SERVICES_LINKS = [
  { to: '/galleri', label: 'Galleri' },
  { to: '/buss', label: 'Buss' },
  { to: '/kino', label: 'Kino' },
];

const THEMES: { value: Theme; label: string; description: string }[] = [
  { value: 'forest', label: 'Forest', description: 'Green & natural' },
  { value: 'sky',    label: 'Sky',    description: 'Blue & open'     },
  { value: 'light',  label: 'Light',  description: 'Clean & bright'  },
  { value: 'dark',   label: 'Dark',   description: 'Easy on the eyes'},
];

function MenuIcon({ open }: { open: boolean }) {
  const ref1 = useRef<SVGLineElement>(null);
  const ref2 = useRef<SVGLineElement>(null);
  const initialized = useRef(false);
  const prevOpen = useRef(open);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (prevOpen.current === open) return;
    prevOpen.current = open;

    const lines = [ref1.current, ref2.current];
    const names = open
      ? ['menu-line-top-open', 'menu-line-bot-open']
      : ['menu-line-top-close', 'menu-line-bot-close'];

    lines.forEach((el, i) => {
      if (!el) return;
      el.style.animation = 'none';
      void el.getBoundingClientRect(); // force reflow so animation restarts
      el.style.animation = `${names[i]} 360ms ease-in-out forwards`;
    });
  }, [open]);

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line ref={ref1} x1="3" y1="8" x2="21" y2="8"
        style={{ transformOrigin: '12px 8px' }}
      />
      <line ref={ref2} x1="3" y1="16" x2="21" y2="16"
        style={{ transformOrigin: '12px 16px' }}
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [meowActive, setMeowActive] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const displayName = user?.name?.trim() || user?.email?.trim() || 'Unknown user';

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // Mjau SSE subscription
  useEffect(() => {
    audioRef.current = new Audio('/mjau.wav');
    const token = useAuthStore.getState().token ?? '';
    const source = new EventSource(`/app-api/meow/events?token=${encodeURIComponent(token)}`);
    source.onmessage = () => {
      audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play().catch(() => {}));
      setMeowActive(true);
      setTimeout(() => setMeowActive(false), 600);
    };
    return () => source.close();
  }, []);

  function closeMenu() {
    setMenuClosing(true);
  }

  function toggleMenu() {
    if (menuOpen && !menuClosing) closeMenu();
    else if (!menuOpen) setMenuOpen(true);
  }

  function onPanelAnimationEnd() {
    if (menuClosing) {
      setMenuClosing(false);
      setMenuOpen(false);
    }
  }

  // Close on route change
  useEffect(() => { if (menuOpen) closeMenu(); }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) closeMenu();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div ref={navRef as React.RefObject<HTMLDivElement>} style={{ position: 'relative', zIndex: 50 }}>
      <nav
        style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}
        className="px-6 h-14 flex-shrink-0"
      >
        {/* Brand — left */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifySelf: 'start' }}>
          <span className="text-base font-bold text-foreground">{config.appTitle}</span>
        </div>

        {/* Text links — center */}
        <ul style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }} className="list-none gap-1">
          {[
            { to: '/',     label: 'Home' },
            { to: '/chat', label: 'Chat' },
          ].map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="relative px-3 py-1.5 text-sm font-medium text-foreground"
              >
                {item.label}
                {location.pathname === item.to && (
                  <span className="underline-grow absolute bottom-0 left-3 right-3 h-0.5 bg-current" />
                )}
              </Link>
            </li>
          ))}
          <li>
            <button
              onClick={() => triggerMeow().catch(() => {})}
              className="relative px-3 py-1.5 text-sm font-medium text-foreground transition-transform duration-150"
              style={{ transform: meowActive ? 'scale(1.15)' : 'scale(1)', display: 'inline-block' }}
            >
              Mjau
              {meowActive && (
                <span className="underline-grow absolute bottom-0 left-3 right-3 h-0.5 bg-current" />
              )}
            </button>
          </li>
        </ul>

        {/* Right side — end */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifySelf: 'end' }} className="gap-2">

          {/* Profile pill + dropdown */}
          {user && (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(v => !v)}
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
                className="gap-2 py-1 pl-1 pr-2.5 rounded-full bg-muted border border-border hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <Avatar src={vocechatService.avatarUrl(user.uid, user.avatarUpdatedAt)} name={displayName} size="sm" />
                <span className="text-[13px] font-medium text-foreground max-w-[120px] truncate">{displayName}</span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-md py-2 z-50">
                  <p className="text-[11px] font-semibold text-secondary-foreground uppercase tracking-widest px-3 pb-1">
                    Theme
                  </p>
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => { setTheme(t.value); setProfileOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                      className={[
                        'px-3 py-1.5 text-sm transition-colors text-left',
                        theme === t.value ? 'text-accent font-semibold' : 'text-foreground hover:bg-muted',
                      ].join(' ')}
                    >
                      <span>{t.label}</span>
                      {theme === t.value && <span className="text-accent text-xs">✓</span>}
                    </button>
                  ))}
                  <div className="my-1.5 border-t border-border" />
                  <button
                    onClick={() => { logout(); setProfileOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}
                    className="px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <LogoutIcon />
                    <span>Logg ut</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 65 }}
            className="w-9 h-9 rounded text-secondary-foreground"
            onClick={toggleMenu}
            title={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </nav>

      {/* Mega-menu */}
      {menuOpen && (
        <>
          {/* Invisible click-away */}
          <div
            className="fixed inset-0"
            style={{ top: 0, zIndex: 55 }}
            onClick={closeMenu}
          />

          {/* Panel */}
          <div
            className={`fixed left-0 right-0 bg-card border-b border-border ${menuClosing ? 'menu-slide-up' : 'menu-slide-down'}`}
            style={{ top: 0, height: '30vh', minHeight: '220px', maxHeight: '340px', zIndex: 60 }}
            onAnimationEnd={onPanelAnimationEnd}
          >
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem', height: '100%', padding: '2rem 3rem', maxWidth: '1100px', margin: '0 auto' }}
            >
              {/* Column 1: Navigation */}
              <div>
                <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-4">
                  Navigation
                </p>
                <ul className="list-none space-y-1">
                  {NAV_LINKS.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className={[
                          'block py-1.5 text-sm font-medium transition-colors',
                          location.pathname === link.to
                            ? 'text-accent border-b border-accent inline-block'
                            : 'text-foreground hover:text-accent',
                        ].join(' ')}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 2: Services */}
              <div>
                <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-4">
                  Services
                </p>
                <ul className="list-none space-y-1">
                  {SERVICES_LINKS.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className={[
                          'block py-1.5 text-sm font-medium transition-colors',
                          location.pathname === link.to
                            ? 'text-accent border-b border-accent inline-block'
                            : 'text-foreground hover:text-accent',
                        ].join(' ')}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Column 3: Gnomoseum */}
              <div>
                <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-4">
                  Gnomoseum
                </p>
              </div>

              {/* Column 4: Projects */}
              <div>
                <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-4">
                  Projects
                </p>
                <ul className="list-none space-y-1">
                  {PROJECT_LINKS.map((link) => (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className={[
                          'block py-1.5 text-sm font-medium transition-colors',
                          location.pathname === link.to
                            ? 'text-accent border-b border-accent inline-block'
                            : 'text-foreground hover:text-accent',
                        ].join(' ')}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { vocechatService } from '@/services/vocechat';
import { triggerMeow } from '@/services/meow';
import { config } from '@/config';
import { THEME_GROUPS } from '@/config/themes';
import type { Theme } from '@/config/themes';

// ── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
function LampIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
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
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

// ── Nav data ────────────────────────────────────────────────────────────────

type NavItem    = { to: string; label: string; Icon: () => JSX.Element };
type NavSection = { heading: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Navigation',
    items: [
      { to: '/',         label: 'Home',           Icon: HomeIcon },
      { to: '/',         label: 'Call',           Icon: PhoneIcon },
      { to: '/chat',     label: 'Chat',           Icon: ChatBubbleIcon },
      { to: '/calendar', label: 'Calendar',       Icon: CalendarNavIcon },
      { to: '/archive',  label: 'Arkiv',          Icon: ArchiveIcon },
    ],
  },
  {
    heading: 'Services',
    items: [
      { to: '/galleri',  label: 'Galleri',        Icon: ImageIcon },
      { to: '/buss',     label: 'Buss',           Icon: BusIcon },
      { to: '/kino',     label: 'Kino',           Icon: FilmIcon },
    ],
  },
  {
    heading: 'Projects',
    items: [
      { to: '/spin',     label: 'Spin the Wheel', Icon: SpinIcon },
      { to: '/lampa',    label: 'Lampa til Jens', Icon: LampIcon },
    ],
  },
];


// ── Hamburger icon ──────────────────────────────────────────────────────────

function MenuIcon({ open }: { open: boolean }) {
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
    <svg width="28" height="18" viewBox="0 0 28 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line ref={ref1} x1="0" y1="3" x2="28" y2="3" style={{ transformOrigin: '14px 3px' }} />
      <line ref={ref2} x1="0" y1="15" x2="28" y2="15" style={{ transformOrigin: '14px 15px' }} />
    </svg>
  );
}

// ── Navbar ──────────────────────────────────────────────────────────────────

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [meowActive, setMeowActive]   = useState(false);
  const [profileOpen, setProfileOpen]         = useState(false);
  const [profileClosing, setProfileClosing]   = useState(false);
  const [hamburgerSearch, setHamburgerSearch] = useState('');
  const [profileSearch,   setProfileSearch]   = useState('');

  const navRef             = useRef<HTMLElement>(null);
  const audioRef           = useRef<HTMLAudioElement | null>(null);
  const hamburgerSearchRef = useRef<HTMLInputElement>(null);
  const profileSearchRef   = useRef<HTMLInputElement>(null);

  const displayName = user?.name?.trim() || user?.email?.trim() || 'Unknown user';

  // Mjau SSE
  useEffect(() => {
    audioRef.current = new Audio('/mjau.wav');
    const token  = useAuthStore.getState().token ?? '';
    const source = new EventSource(`/app-api/meow/events?token=${encodeURIComponent(token)}`);
    source.onmessage = () => {
      audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play().catch(() => {}));
      setMeowActive(true);
      setTimeout(() => setMeowActive(false), 600);
    };
    return () => source.close();
  }, []);

  // Auto-focus search input when panel opens
  useEffect(() => {
    if (menuOpen && !menuClosing) setTimeout(() => hamburgerSearchRef.current?.focus(), 50);
  }, [menuOpen]);

  useEffect(() => {
    if (profileOpen && !profileClosing) setTimeout(() => profileSearchRef.current?.focus(), 50);
  }, [profileOpen]);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (menuOpen)    closeMenu();
      if (profileOpen) closeProfile();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, profileOpen]);

  // Close on route change
  useEffect(() => {
    if (menuOpen)    closeMenu();
    if (profileOpen) closeProfile();
  }, [location.pathname]);

  function closeMenu()    { setMenuClosing(true);    setHamburgerSearch(''); }
  function closeProfile() { setProfileClosing(true); setProfileSearch('');   }

  function openProfileFromMenu() {
    setHamburgerSearch('');
    setMenuClosing(true);
    setProfileOpen(true);
  }

  function toggleMenu() {
    if (profileOpen && !profileClosing) { closeProfile(); return; }
    if (menuOpen && !menuClosing) closeMenu();
    else if (!menuOpen) setMenuOpen(true);
  }

  function toggleProfile() {
    if (menuOpen && !menuClosing) closeMenu();
    if (profileOpen && !profileClosing) closeProfile();
    else if (!profileOpen) setProfileOpen(true);
  }

  function onPanelAnimationEnd() {
    if (menuClosing) { setMenuClosing(false); setMenuOpen(false); }
  }
  function onProfilePanelAnimationEnd() {
    if (profileClosing) { setProfileClosing(false); setProfileOpen(false); }
  }

  // Filtered nav sections
  const q = hamburgerSearch.toLowerCase();
  const filteredSections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q)) }))
    .filter(s => s.items.length > 0);

  // Filtered theme groups
  const pq = profileSearch.toLowerCase();
  const filteredGroups = THEME_GROUPS.map(g => ({
    ...g,
    themes: g.themes.filter(t =>
      t.label.toLowerCase().includes(pq) || t.description.toLowerCase().includes(pq)
    ),
  })).filter(g => g.themes.length > 0);

  return (
    <div ref={navRef as React.RefObject<HTMLDivElement>} style={{ position: 'relative', zIndex: 50 }}>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <nav className="flex items-center px-8 h-24 flex-shrink-0">
        {/* Brand — left */}
        <div className="flex-1">
          <Link to="/" className="text-4xl font-bold text-foreground" style={{ textDecoration: 'none' }}>
            {config.appTitle}
          </Link>
        </div>

        {/* Center links — hidden on mobile */}
        <ul className="hidden lg:flex items-center justify-around flex-1 list-none">
          {[{ to: '/', label: 'Call' }, { to: '/chat', label: 'Chat' }].map(item => (
            <li key={item.to}>
              <Link to={item.to} className="relative px-4 py-2 text-xl font-medium text-foreground">
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
              className="relative px-4 py-2 text-xl font-medium text-foreground transition-transform duration-150"
              style={{ transform: meowActive ? 'scale(1.15)' : 'scale(1)', display: 'inline-block' }}
            >
              Mjau
              {meowActive && <span className="underline-grow absolute bottom-0 left-3 right-3 h-0.5 bg-current" />}
            </button>
          </li>
        </ul>

        {/* Right side — always above overlays */}
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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 65 }}
            className="w-11 h-8 rounded text-foreground"
            onClick={toggleMenu}
          >
            <MenuIcon open={(menuOpen && !menuClosing) || (profileOpen && !profileClosing)} />
          </button>
        </div>
      </nav>

      {/* ── Hamburger overlay ───────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className={`fixed inset-0 bg-card flex flex-col ${menuClosing ? 'panel-fade-out' : 'panel-fade-in'}`}
          style={{ zIndex: 100 }}
          onAnimationEnd={onPanelAnimationEnd}
        >
          {/* Search header */}
          <div className="flex items-center gap-4 px-8 h-24">
            <span className="text-secondary-foreground flex-shrink-0"><SearchIcon /></span>
            <input
              ref={hamburgerSearchRef}
              value={hamburgerSearch}
              onChange={e => setHamburgerSearch(e.target.value)}
              placeholder="Hva leter du etter?"
              className="flex-1 bg-transparent text-foreground text-lg outline-none placeholder:text-secondary-foreground"
            />
            {/* Spacer aligns input with the hamburger button above */}
            <div className="w-11 flex-shrink-0" />
          </div>
          <div className="border-t border-border" />

          {/* Sections */}
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-12">
            {filteredSections.length === 0 ? (
              <p className="text-secondary-foreground text-sm">Ingen resultater for «{hamburgerSearch}»</p>
            ) : (
              filteredSections.map(section => (
                <div key={section.heading} className="mb-8">
                  <h2 className="text-lg font-bold text-foreground mb-3">{section.heading}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                    {section.heading === 'Navigation' && (
                      <>
                        {(!q || 'mjau'.includes(q)) && (
                          <button
                            onClick={() => { triggerMeow().catch(() => {}); closeMenu(); }}
                            className="lg:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                          >
                            <span className="flex-shrink-0 text-secondary-foreground"><MjauIcon /></span>
                            Mjau
                          </button>
                        )}
                        {(!q || displayName.toLowerCase().includes(q) || 'profil'.includes(q)) && (
                          <button
                            onClick={openProfileFromMenu}
                            className="sm:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                          >
                            <span className="flex-shrink-0 text-secondary-foreground"><UserIcon /></span>
                            {displayName}
                          </button>
                        )}
                      </>
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

      {/* ── Profile overlay ─────────────────────────────────────────────────── */}
      {profileOpen && (
        <div
          className={`fixed inset-0 bg-card flex flex-col ${profileClosing ? 'panel-fade-out' : 'panel-fade-in'}`}
          style={{ zIndex: 100 }}
          onAnimationEnd={onProfilePanelAnimationEnd}
        >
          {/* Search header */}
          <div className="flex items-center gap-4 px-8 h-24">
            <span className="text-secondary-foreground flex-shrink-0"><SearchIcon /></span>
            <input
              ref={profileSearchRef}
              value={profileSearch}
              onChange={e => setProfileSearch(e.target.value)}
              placeholder="Søk..."
              className="flex-1 bg-transparent text-foreground text-lg outline-none placeholder:text-secondary-foreground"
            />
            {/* Spacer aligns input with the hamburger button above */}
            <div className="w-11 flex-shrink-0" />
          </div>
          <div className="border-t border-border" />

          {/* Sections */}
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-12">

            {/* Profile info */}
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

            {/* Themes — grouped */}
            {filteredGroups.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-bold text-foreground mb-3">Tema</h2>
                {filteredGroups.map(group => (
                  <div key={group.label} className="mb-6">
                    {THEME_GROUPS.length > 1 && (
                      <p className="text-xs font-semibold text-secondary-foreground uppercase tracking-widest mb-2">
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
                ))}
              </div>
            )}

            {/* Account */}
            <div>
              <h2 className="text-lg font-bold text-foreground mb-3">Konto</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1">
                <button
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                >
                  <span className="flex-shrink-0 text-secondary-foreground"><SettingsIcon /></span>
                  Kontoinnstillinger
                </button>
                <button
                  onClick={() => { logout(); closeProfile(); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-foreground hover:bg-muted transition-colors text-xl font-medium"
                >
                  <span className="flex-shrink-0 text-secondary-foreground"><LogoutIcon /></span>
                  Logg ut
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

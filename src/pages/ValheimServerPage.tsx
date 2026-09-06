import { useCallback, useEffect, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { loadValheimServers, type ValheimServer, type ValheimServerList } from '@/services/valheim';
import styles from './ValheimServerPage.module.css';

const REFRESH_INTERVAL_MS = 10000;

// Served locally rather than hotlinked, so the page still renders if the
// original CDN goes away.
const VALHEIM_LOGO = '/images/valheim-logo.png';

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CopyField({
  label,
  value,
  wide,
  hero,
}: {
  label: string;
  value: string;
  wide?: boolean;
  hero?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable outside secure contexts; ignore silently.
    }
  };

  return (
    <button
      type="button"
      className={[styles.copyField, wide ? styles.copyFieldWide : '', hero ? styles.copyFieldHero : '']
        .filter(Boolean)
        .join(' ')}
      onClick={copy}
      title={`Kopier ${label.toLowerCase()}`}
    >
      <span className={styles.copyLabel}>{label}</span>
      <span className={styles.copyValue}>{value}</span>
      <span className={styles.copyIcon}>
        {copied ? <span className={styles.copiedTick}>Kopiert</span> : <CopyIcon />}
      </span>
    </button>
  );
}

function formatSession(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} t ${minutes} min`;
  return `${minutes} min`;
}

function ServerCard({ server }: { server: ValheimServer }) {
  const online = server.online;
  const players = server.players;

  const where = server.world ? ` i ${server.world}` : ' inne';
  const playerLabel = !online
    ? 'ingen kontakt'
    : (players?.online ?? 0) === 1
      ? `viking${where}`
      : `vikinger${where}`;

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <div className={styles.icon}>
          <img src={VALHEIM_LOGO} alt="" className={styles.iconImage} />
        </div>
        <div className={styles.headText}>
          <h2 className={styles.name} title={server.name}>{server.name}</h2>
          <div className={styles.metaRow}>
            <span className={[styles.statePill, online ? styles.stateOnline : styles.stateOffline].join(' ')}>
              {online ? 'Oppe' : 'Nede'}
            </span>
            {server.version && <span className={styles.versionPill}>v{server.version}</span>}
          </div>
        </div>
      </header>

      <div className={styles.hero}>
        <div className={styles.heroCount}>
          <span className={styles.heroNumber}>{players?.online ?? '–'}</span>
          <span className={styles.heroMax}>/ {players?.max ?? '–'}</span>
        </div>
        <span className={styles.heroLabel}>{playerLabel}</span>
      </div>

      {server.playerList.length > 0 && (
        <div className={styles.players}>
          {server.playerList.map((player) => {
            const session = formatSession(player.durationSeconds);
            return (
              <span key={player.name} className={styles.player}>
                {player.name}
                {session && <span className={styles.playerSession}>{session}</span>}
              </span>
            );
          })}
        </div>
      )}

      <dl className={styles.facts}>
        {server.world && (
          <div className={styles.fact}>
            <dt>Verden</dt>
            <dd title={server.world}>{server.world}</dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>Svartid</dt>
          <dd>{server.latencyMs != null ? `${server.latencyMs} ms` : '–'}</dd>
        </div>
      </dl>

      <div className={styles.connect}>
        <h3 className={styles.connectTitle}>Bli med</h3>
        <div className={styles.connectFields}>
          <CopyField label="Adresse" value={server.address} wide />
          {server.joinCode && <CopyField label="Join-kode" value={server.joinCode} hero />}
          {server.password && <CopyField label="Passord" value={server.password} wide />}
        </div>
      </div>

      {!online && server.error && <p className={styles.probeError}>{server.error}</p>}
    </article>
  );
}

const HOW_TO_STEPS = [
  {
    title: 'Last ned WireGuard',
    body: (
      <>
        Serveren ligger ikke åpent på internett – den ligger bak et privat nettverk. WireGuard er VPN-en som slipper
        deg inn. Hent den fra{' '}
        <a href="https://www.wireguard.com/install/" target="_blank" rel="noreferrer">
          wireguard.com/install
        </a>{' '}
        og installer som vanlig. Finnes til Windows, Mac, Linux, iPhone og Android.
      </>
    ),
  },
  {
    title: 'Spør Jens Martin pent',
    body: (
      <>
        Du trenger din egen tilgang. Si fra i chatten, så får du enten en fil som heter noe med{' '}
        <code>.conf</code>, eller en QR-kode du skanner. Den er personlig – ikke send den videre til andre, da slutter
        den å virke for deg.
      </>
    ),
  },
  {
    title: 'Legg tunnelen inn i WireGuard',
    body: (
      <>
        <strong>PC og Mac:</strong> åpne WireGuard, trykk <em>Import tunnel(s) from file</em> og velg fila du fikk.
        <br />
        <strong>Mobil:</strong> trykk <em>+</em> nede til høyre og velg <em>Scan from QR code</em>, så skanner du koden.
      </>
    ),
  },
  {
    title: 'Slå den på',
    body: (
      <>
        Trykk <em>Activate</em> på PC, eller dra bryteren til på på mobil. Den skal lyse grønt og vise at data går inn
        og ut. Nå er du på nettverket – VPN-en må stå på så lenge du spiller.
      </>
    ),
  },
  {
    title: 'Bli med i spillet',
    body: (
      <>
        Start Valheim, velg karakteren din, og trykk <em>Join IP</em> nede i serverlista. Lim inn adressen fra kortet
        over – hele greia med portnummeret – og skriv passordet når det spør. Så er du i Guttakos.
      </>
    ),
  },
];

function HowToPlay() {
  return (
    <section className={styles.howTo}>
      <h2 className={styles.howToTitle}>Hvordan bli med</h2>
      <p className={styles.howToIntro}>
        Første gang tar det fem minutter. Etterpå er det bare å slå på VPN-en og spille.
      </p>

      <ol className={styles.steps}>
        {HOW_TO_STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <div className={styles.stepBody}>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepText}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className={styles.howToNote}>
        <strong>Får du det ikke til?</strong> Sjekk at WireGuard står på – det er nesten alltid det. Står det{' '}
        <em>Nede</em> på kortet over, er det serveren som er av, og da hjelper ikke VPN-en. Slå av tunnelen når du er
        ferdig å spille.
      </p>
    </section>
  );
}

export function ValheimServerPage() {
  const [data, setData] = useState<ValheimServerList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const result = await loadValheimServers();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Kunne ikke hente status.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const servers = data?.servers ?? [];

  return (
    <AppLayout>
      <div className={styles.page}>
        <header className={styles.pageHead}>
          <div>
            <h1 className={styles.title}>Valheim Server</h1>
            <p className={styles.subtitle}>Guttas viking server, her kan vi kose oss</p>
          </div>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void refresh(true)}
            disabled={refreshing}
            title="Oppdater nå"
          >
            <span className={refreshing ? styles.spinning : undefined}>
              <RefreshIcon />
            </span>
            Oppdater
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <LoadingSpinner center />
        ) : servers.length > 0 ? (
          <div className={styles.grid}>
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h2>Ingen server satt opp</h2>
            <p>
              Sett <code>VALHEIM_SERVER_ADDRESS</code> til adressen til serveren, for eksempel{' '}
              <code>192.168.0.190:2456</code>. Da spør appen serveren direkte og viser hvem som er inne.
            </p>
          </div>
        )}

        <HowToPlay />
      </div>
    </AppLayout>
  );
}

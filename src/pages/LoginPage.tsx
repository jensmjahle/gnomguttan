import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppApiError } from '@/services/appApi';
import { lastRememberChoice } from '@/services/auth';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { config } from '@/config';
import { appLogoSrc } from '@/constants/assets';
import styles from './LoginPage.module.css';

/** Turns a failed auth request into something to show; the server already words its errors. */
export function authErrorText(err: unknown, fallback: string): string {
  if (err instanceof AppApiError) {
    if (err.status === 401) return 'Feil e-post eller passord.';
    if (err.status >= 400 && err.status < 600 && err.message && !err.message.startsWith('HTTP ')) return err.message;
  }
  return fallback;
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const needsRelogin = useAuthStore((s) => s.needsRelogin);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(lastRememberChoice);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, remember);
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorText(err, 'Innloggingen feilet. Prøv igjen.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <img className={styles.logo} src={appLogoSrc} alt="" aria-hidden="true" />
          <h1 className={styles.title}>{config.appTitle}</h1>
          <p className={styles.subtitle}>Logg inn med e-posten og passordet ditt</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {needsRelogin && (
            <p className={styles.notice}>
              Innloggingen er flyttet fra VoceChat til Gnomguttan. Logg inn én gang til med samme e-post og passord som før.
            </p>
          )}
          <Input
            label="E-post"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deg@eksempel.no"
            autoComplete="email"
            required
          />
          <Input
            label="Passord"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passord"
            autoComplete="current-password"
            required
          />
          <label className={styles.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              Husk meg
              <span className={styles.rememberHint}> — hold meg innlogget i 30 dager</span>
            </span>
          </label>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <Button type="submit" loading={loading} size="lg" className={styles.submitBtn}>
            Logg inn
          </Button>
        </form>

        <p className={styles.hint}>Glemt passordet? Be en admin om en lenke for å lage nytt.</p>
      </div>
    </div>
  );
}

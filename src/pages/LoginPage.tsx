import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { config } from '@/config';
import { appLogoSrc } from '@/constants/assets';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403 || err.status === 404) {
          setError('Invalid email or password. Please try again.');
        } else if (err.status === 423) {
          setError('This account is frozen.');
        } else {
          setError(`Login failed (${err.status}). Check the VoceChat endpoint and try again.`);
        }
      } else {
        setError('Login failed. Please try again.');
      }
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
          <p className={styles.subtitle}>Sign in with your VoceChat account</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
            required
          />

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" loading={loading} size="lg" className={styles.submitBtn}>
            Sign in
          </Button>
        </form>

        <p className={styles.hint}>
          Connects through <code>{config.vocechatHost || 'local /api proxy'}</code>
        </p>
      </div>
    </div>
  );
}

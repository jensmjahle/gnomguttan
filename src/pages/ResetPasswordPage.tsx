import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { appLogoSrc } from '@/constants/assets';
import { checkReset, lastRememberChoice, resetPassword, takeTokenFromUrl } from '@/services/auth';
import { authErrorText } from './LoginPage';
import styles from './LoginPage.module.css';

/** /tilbakestill#<token> — choosing a new password from a link an admin made. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromUrl);
  const [name, setName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(lastRememberChoice);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Lenken mangler koden sin. Åpne hele lenken du fikk.');
      setChecking(false);
      return;
    }
    checkReset(token)
      .then((link) => setName(link.name))
      .catch((err) => setError(authErrorText(err, 'Kunne ikke sjekke lenken.')))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passordene er ikke like.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword({ token, password, remember });
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorText(err, 'Kunne ikke lagre passordet. Prøv igjen.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <img className={styles.logo} src={appLogoSrc} alt="" aria-hidden="true" />
          <h1 className={styles.title}>Nytt passord</h1>
          {name && <p className={styles.subtitle}>for {name}</p>}
        </div>

        {checking ? (
          <p className={styles.subtitle}>Sjekker lenken…</p>
        ) : name === null ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <p className={styles.notice}>Når du lagrer, blir du logget ut på alle andre enheter.</p>
            <Input label="Nytt passord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minst 8 tegn" autoComplete="new-password" minLength={8} required />
            <Input label="Gjenta passord" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            <label className={styles.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Husk meg<span className={styles.rememberHint}> — hold meg innlogget i 30 dager</span></span>
            </label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <Button type="submit" loading={loading} size="lg" className={styles.submitBtn}>Lagre og logg inn</Button>
          </form>
        )}
      </div>
    </div>
  );
}

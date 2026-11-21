import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { config } from '@/config';
import { appLogoSrc } from '@/constants/assets';
import { checkInvite, lastRememberChoice, register, takeTokenFromUrl } from '@/services/auth';
import { authErrorText } from './LoginPage';
import styles from './LoginPage.module.css';

/** /registrer#<token> — joining from an invite link an admin made. */
export function RegisterPage() {
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromUrl);
  const [invite, setInvite] = useState<{ invitedBy: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
    checkInvite(token)
      .then(setInvite)
      .catch((err) => setError(authErrorText(err, 'Kunne ikke sjekke invitasjonen.')))
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
      await register({ token, name, email, password, remember });
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorText(err, 'Kunne ikke lage kontoen. Prøv igjen.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <img className={styles.logo} src={appLogoSrc} alt="" aria-hidden="true" />
          <h1 className={styles.title}>Bli med i {config.appTitle}</h1>
          {invite && <p className={styles.subtitle}>Invitert av {invite.invitedBy}</p>}
        </div>

        {checking ? (
          <p className={styles.subtitle}>Sjekker invitasjonen…</p>
        ) : !invite ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input label="Navn" value={name} onChange={(e) => setName(e.target.value)} placeholder="Det andre ser" autoComplete="name" maxLength={40} required />
            <Input label="E-post" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="deg@eksempel.no" autoComplete="email" required />
            <Input label="Passord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minst 8 tegn" autoComplete="new-password" minLength={8} required />
            <Input label="Gjenta passord" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            <label className={styles.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Husk meg<span className={styles.rememberHint}> — hold meg innlogget i 30 dager</span></span>
            </label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <Button type="submit" loading={loading} size="lg" className={styles.submitBtn}>Lag konto</Button>
          </form>
        )}
      </div>
    </div>
  );
}

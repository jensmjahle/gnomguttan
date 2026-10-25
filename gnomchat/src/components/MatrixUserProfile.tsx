import { useEffect, useState } from 'react';
import { matrixCall } from '@/services/matrix';
import { MatrixAvatar } from './MatrixAvatar';
import { MatrixSheet, MatrixNotice, MatrixButton } from './MatrixForms';
import { Text } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
export function MatrixUserProfile({ userId, onClose, onDM }: { userId: string | null; onClose: () => void; onDM: (id: string, title: string) => void }) {
  const { tokens, font } = useTheme(); const myId = useMatrixMobileStore(s => s.userId);
  const [profile, setProfile] = useState<{ id: string; name: string; avatar?: string } | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; setError(''); setProfile(null); if (userId) void matrixCall<any>('profile', { userId }).then(value => { if (active) setProfile(value); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, [userId]);
  return <MatrixSheet title="Profil" visible={!!userId} onClose={onClose}>
    <MatrixAvatar name={profile?.name || userId || '?'} mxc={profile?.avatar} size={80} /><Text style={{ color: tokens.textPrimary, fontFamily: font(700), fontSize: 24 }}>{profile?.name || userId}</Text><Text selectable style={{ color: tokens.textMuted }}>{userId}</Text><MatrixNotice text={error} error />
    {userId !== myId && <MatrixButton title={busy ? 'Åpner …' : 'Send direktemelding'} disabled={busy} onPress={() => { setBusy(true); void matrixCall<string>('conversation', { target: userId, encrypted: true }).then(id => { onClose(); onDM(id, profile?.name || userId || 'Samtale'); }).catch(reason => setError(reason.message)).finally(() => setBusy(false)); }} />}
  </MatrixSheet>;
}

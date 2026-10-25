import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { matrixCall } from '@/services/matrix';
import { MatrixAvatar } from './MatrixAvatar';
import { MatrixButton, MatrixField, MatrixNotice } from './MatrixForms';
export function MatrixProfilePanel() {
  const [profile, setProfile] = useState<{ name: string; avatar?: string; id: string } | null>(null); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useFocusEffect(useCallback(() => { let active = true; void matrixCall<any>('profile').then(value => { if (active) { setProfile(value); setName(value.name); } }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []));
  async function save(avatar?: { base64: string; mimetype: string }) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { const result = await matrixCall<any>('saveProfile', { name, avatar }); setProfile(result); setName(result.name); setNotice('Profilen er oppdatert.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke lagre profilen.'); } finally { setBusy(false); } }
  async function pick() { try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 }); if (result.canceled || !result.assets[0]) return; const asset = result.assets[0]; if ((asset.fileSize || 0) > 5 * 1024 * 1024) throw new Error('Velg et profilbilde under 5 MB.'); const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }); await save({ base64, mimetype: asset.mimeType || 'image/jpeg' }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke åpne bildevelgeren.'); } }
  return <View style={{ gap: 12 }}><MatrixAvatar name={profile?.name || '?'} mxc={profile?.avatar} size={72} /><MatrixField label="Visningsnavn" value={name} onChangeText={setName} editable={!busy} maxLength={200} /><MatrixButton title={busy ? 'Lagrer …' : 'Lagre profil'} disabled={busy || !name.trim()} onPress={() => void save()} /><MatrixButton title="Endre profilbilde" secondary disabled={busy || !name.trim()} onPress={() => void pick()} /><MatrixNotice text={notice} /><MatrixNotice text={error} error /></View>;
}

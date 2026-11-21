import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@/data/queryClient';
import { loadNotifications } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { IconButton, PressableScale } from '@/components/ui';
import { Avatar } from '@/components/Avatar';

/** Bell (with unread count) and your own avatar, in every tab's header. */
export function HeaderActions() {
  const navigation = useNavigation();
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery({ queryKey: qk.notifications, queryFn: () => loadNotifications() });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}>
      <IconButton icon="notifications-outline" label="Varsler" badge={data?.unreadCount} onPress={() => navigation.navigate('Notifications')} />
      {user ? (
        <PressableScale accessibilityLabel="Din profil" onPress={() => navigation.navigate('Profile', {})}>
          <Avatar uid={user.uid} name={user.name} avatarUpdatedAt={user.avatarUpdatedAt} size={30} />
        </PressableScale>
      ) : null}
    </View>
  );
}

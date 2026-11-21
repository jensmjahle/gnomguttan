import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { onMeow, triggerMeow } from '@/services/meow';

/** The website's cat: tap it to meow at everyone; it jumps when someone else does. */
export function MeowCat() {
  const jump = useRef(new Animated.Value(0)).current;

  const play = () => {
    jump.setValue(0);
    Animated.sequence([
      Animated.timing(jump, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(jump, { toValue: 0, friction: 3, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => onMeow(() => { play(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }), []);

  return (
    <Pressable
      accessibilityLabel="Mjau til alle"
      hitSlop={8}
      style={{ marginLeft: 14, marginRight: 4 }}
      onPress={() => { play(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); void triggerMeow().catch(() => {}); }}
    >
      <Animated.View style={{ transform: [{ translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }, { scale: jump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] }}>
        <Text style={{ fontSize: 22 }}>🐈</Text>
      </Animated.View>
    </Pressable>
  );
}

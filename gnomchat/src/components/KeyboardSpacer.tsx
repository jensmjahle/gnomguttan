import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

/**
 * Grows with the on-screen keyboard, frame by frame, so whatever sits above it
 * stays right on top of the keyboard. The height comes straight from the
 * system's keyboard insets, so it is the same whether or not Android resizes
 * the window (edge-to-edge) and always returns to 0 when the keyboard closes.
 * `inset` is bottom padding the layout already has (e.g. the nav-bar inset),
 * which the keyboard covers anyway.
 */
export function KeyboardSpacer({ inset = 0 }: { inset?: number }) {
  const { height } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ height: Math.max(0, -height.value - inset) }), [inset]);
  return <Animated.View style={style} />;
}

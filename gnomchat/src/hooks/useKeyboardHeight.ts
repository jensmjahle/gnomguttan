import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// react-native's KeyboardAvoidingView is unreliable under SDK 54 edge-to-edge
// (it doesn't pick up the IME inset correctly). Instead we read the real keyboard
// height from Keyboard events and let the caller push content up by exactly that
// amount. Works in Expo Go (no native module required).
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS fires Will* (smooth); Android only fires Did*.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

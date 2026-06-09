import { useFonts } from 'expo-font';

// The same Futura PT weights the website ships (public/fonts/*.ttf), copied into
// assets/fonts/ by scripts/sync-theme.mjs. We register them under stable family
// names keyed by basename so the same name works in Expo Go and EAS builds.
export const FONT_ASSETS = {
  FuturaCyrillicLight: require('../../assets/fonts/FuturaCyrillicLight.ttf'),
  FuturaCyrillicBook: require('../../assets/fonts/FuturaCyrillicBook.ttf'),
  FuturaCyrillicMedium: require('../../assets/fonts/FuturaCyrillicMedium.ttf'),
  FuturaCyrillicDemi: require('../../assets/fonts/FuturaCyrillicDemi.ttf'),
  FuturaCyrillicBold: require('../../assets/fonts/FuturaCyrillicBold.ttf'),
  FuturaCyrillicExtraBold: require('../../assets/fonts/FuturaCyrillicExtraBold.ttf'),
  FuturaCyrillicHeavy: require('../../assets/fonts/FuturaCyrillicHeavy.ttf'),
} as const;

export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900;

const WEIGHT_TO_FAMILY: Record<FontWeight, keyof typeof FONT_ASSETS> = {
  300: 'FuturaCyrillicLight',
  400: 'FuturaCyrillicBook',
  500: 'FuturaCyrillicMedium',
  600: 'FuturaCyrillicDemi',
  700: 'FuturaCyrillicBold',
  800: 'FuturaCyrillicExtraBold',
  900: 'FuturaCyrillicHeavy',
};

/** Resolve a font family name for a weight, honouring per-theme system-font override. */
export function fontFamily(weight: FontWeight, systemOverride: boolean): string | undefined {
  if (systemOverride) return undefined; // undefined → React Native system font
  return WEIGHT_TO_FAMILY[weight];
}

/** Loads the bundled Futura PT fonts. Returns [loaded, error]. */
export function useAppFonts() {
  return useFonts(FONT_ASSETS);
}

// Dynamic Expo config. Version name/code can be injected by CI via env so that
// `eas build --local` produces a unique, monotonically-increasing Android versionCode.
//   APP_VERSION       -> versionName (falls back to the value below)
//   APP_VERSION_CODE  -> android.versionCode (falls back to 1 for local dev)

const VERSION = process.env.APP_VERSION || '1.0.0';
const VERSION_CODE = Number(process.env.APP_VERSION_CODE || '1');

/** @type {import('@expo/config').ExpoConfig} */
module.exports = {
  name: 'GnomChat',
  slug: 'gnomchat',
  scheme: 'gnomchat',
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/app-icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/app-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#c8e89a',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.gnomchat.mobile',
  },
  android: {
    package: 'com.gnomchat.mobile',
    versionCode: VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: './assets/app-icon.png',
      backgroundColor: '#c8e89a',
    },
  },
  plugins: [
    'expo-asset',
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/FuturaCyrillicLight.ttf',
          './assets/fonts/FuturaCyrillicBook.ttf',
          './assets/fonts/FuturaCyrillicMedium.ttf',
          './assets/fonts/FuturaCyrillicDemi.ttf',
          './assets/fonts/FuturaCyrillicBold.ttf',
          './assets/fonts/FuturaCyrillicExtraBold.ttf',
          './assets/fonts/FuturaCyrillicHeavy.ttf',
        ],
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/app-icon.png',
        color: '#2d7d32',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow GnomChat to access your photos to send images.',
      },
    ],
    'expo-secure-store',
  ],
  // Expo account that owns the project (required for `eas build`).
  owner: process.env.EAS_OWNER || 'jensmjahle',
  extra: {
    vocechatHost: process.env.EXPO_PUBLIC_VOCECHAT_HOST || 'https://chat.gnomguttan.no',
    // Created by `eas init` → @jensmjahle/gnomchat.
    eas: {
      projectId: process.env.EAS_PROJECT_ID || 'fb8e5419-47a6-4a49-a8b5-8c2d8430bc0c',
    },
  },
};

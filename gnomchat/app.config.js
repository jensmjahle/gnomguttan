// Dynamic Expo config. Version name/code can be injected by CI via env so that
// `eas build --local` produces a unique, monotonically-increasing Android versionCode.
//   APP_VERSION       -> versionName (falls back to the value below)
//   APP_VERSION_CODE  -> android.versionCode (falls back to 1 for local dev)

const fs = require('node:fs');
const path = require('node:path');

const VERSION = process.env.APP_VERSION || '1.0.0';
// Firebase config for Android push (FCM). Expo push on Android only works when the
// build includes it; CI writes it from the GOOGLE_SERVICES_JSON secret (see SETUP.md).
const GOOGLE_SERVICES_FILE = process.env.GOOGLE_SERVICES_FILE || './google-services.json';
const hasGoogleServices = fs.existsSync(path.resolve(__dirname, GOOGLE_SERVICES_FILE));
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
    infoPlist: {
      NSMicrophoneUsageDescription: 'GnomChat bruker mikrofonen til lydmeldinger i chatten.',
      NSLocationWhenInUseUsageDescription: 'GnomChat bruker posisjonen bare når du velger å dele den i chatten.',
      NSCameraUsageDescription: 'GnomChat bruker kameraet når du tar bilder til chatten, feeden og albumene.',
      NSPhotoLibraryUsageDescription: 'GnomChat trenger tilgang til bildene dine for å dele dem.',
    },
  },
  android: {
    package: 'com.gnomchat.mobile',
    versionCode: VERSION_CODE,
    ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS'],
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
        photosPermission: 'GnomChat trenger tilgang til bildene dine for å dele dem.',
        cameraPermission: 'GnomChat bruker kameraet når du tar bilder til chatten, feeden og albumene.',
      },
    ],
    'expo-secure-store',
    ['expo-audio', { microphonePermission: 'GnomChat bruker mikrofonen til lydmeldinger i chatten.' }],
    ['expo-location', { locationWhenInUsePermission: 'GnomChat bruker posisjonen bare når du velger å dele den i chatten.' }],
    'expo-video',
    'expo-web-browser',
  ],
  // Expo account that owns the project (required for `eas build`).
  owner: process.env.EAS_OWNER || 'jensmjahle',
  extra: {
    appApiHost: process.env.EXPO_PUBLIC_APP_API_HOST || 'https://gnomguttan.no',
    matrixHomeserverUrl: process.env.EXPO_PUBLIC_MATRIX_HOMESERVER_URL || 'https://gnomchat.gnomguttan.no',
    // Created by `eas init` → @jensmjahle/gnomchat.
    eas: {
      projectId: process.env.EAS_PROJECT_ID || 'fb8e5419-47a6-4a49-a8b5-8c2d8430bc0c',
    },
  },
};

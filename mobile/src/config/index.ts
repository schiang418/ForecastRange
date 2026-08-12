import { Platform } from 'react-native';

// API base URL — update to your Railway deployment URL.
// On web the app is served BY the API server (at /m), so relative same-origin
// calls work on any deployment and dodge CORS entirely.
export const API_BASE_URL = Platform.OS === 'web'
  ? ''
  : __DEV__
    ? 'http://localhost:3000'
    : 'https://forecastrange-copy-production.up.railway.app';

export const GOOGLE_CLIENT_ID = '915364748166-itjc0vu4sk97ng4227u90mjpp6igs3qq.apps.googleusercontent.com';
export const APPLE_BUNDLE_ID = 'com.forecastrange.app'; // TODO: replace

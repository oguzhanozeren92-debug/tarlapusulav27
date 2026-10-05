import type { CapacitorConfig } from '@capacitor/cli';

// Native mobile shell for App Store / Google Play builds.
const config: CapacitorConfig = {
  appId: 'com.tarlapusula.app',
  appName: 'TarlaPusula',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

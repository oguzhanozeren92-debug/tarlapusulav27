import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tarlapusula.app',
  appName: 'TarlaPusula',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;

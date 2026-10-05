import type { CapacitorConfig } from '@capacitor/cli';

// Native mobile shell for App Store / Google Play builds.
const liveServerUrl = process.env.CAPACITOR_LIVE_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.tarlapusula.app',
  appName: 'TarlaPusula',
  webDir: 'dist',
  server: liveServerUrl
    ? {
        url: liveServerUrl,
        cleartext: false,
        androidScheme: 'https',
      }
    : {
        androidScheme: 'https',
      },
};

export default config;

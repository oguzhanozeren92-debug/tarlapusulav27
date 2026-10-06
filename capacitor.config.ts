import type { CapacitorConfig } from '@capacitor/cli';

// Native mobile shell for App Store / Google Play builds.
const liveServerUrl = process.env.CAPACITOR_LIVE_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.tarlapusula.app',
  appName: 'TarlaPusula',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
      autoBackdropColor: 'auto',
    },
    StatusBar: {
      style: 'LIGHT',
    },
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      launchFadeOutDuration: 180,
      backgroundColor: '#ffffffff',
      showSpinner: false,
    },
  },
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

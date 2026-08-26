import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brokly.app',
  appName: 'Brokly',
  webDir: 'out',
  // Brokly is a server-rendered Next.js app (API routes, auth, realtime), so the
  // WebView loads the live app URL instead of bundled static files.
  //
  // Change APP_ORIGIN to your production HTTPS URL when you host the app. For a
  // quick LAN test before hosting, point it at your computer's local IP
  // (cleartext: true allows http while testing; remove once HTTPS).
  server: {
    url: process.env.APP_ORIGIN || 'http://192.168.1.7:4028',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  backgroundColor: '#f8fafc',
};

export default config;

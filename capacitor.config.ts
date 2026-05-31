import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.switchlocally.worker',
  appName: 'Switch Players',
  webDir:  'out',
  android: {
    path:            'android',
    backgroundColor: '#000000',
  },
  server: {
    // TEMPORARY (Jyoti memory device test) — points the app at the local dev
    // server via a cloudflare tunnel, auto-logging in the test worker.
    // REVERT to 'https://app.switchlocally.com/players' before any prod build.
    url:       'https://download-belongs-held-arlington.trycloudflare.com/dev-login?phone=9205617375',
    cleartext: false,
  },
}

export default config

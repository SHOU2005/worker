import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.switchlocally.captain',
  appName: 'Switch Captain',
  webDir:  'out',
  android: {
    path:            'android-captain',
    backgroundColor: '#FFFFFF',
  },
  // Land on /captain (scope root). The router handles splash → login →
  // dashboard internally based on session, so returning users go straight
  // to the dashboard instead of sitting through splash every cold start.
  // Previous /captain/splash forced the splash render every reopen and
  // also broke SW scope matching against captain-manifest.json scope=/captain.
  server: {
    url:       'https://app.switchlocally.com/captain',
    cleartext: false,
  },
}

export default config

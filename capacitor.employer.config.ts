import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.switchlocally.employer',
  appName: 'Switch',
  webDir:  'out',
  android: {
    path:            'android-employer',
    backgroundColor: '#000000',
  },
  server: {
    url:       'https://app.switchlocally.com',
    cleartext: false,
  },
}

export default config

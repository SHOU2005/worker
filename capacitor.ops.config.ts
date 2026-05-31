import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.switchlocally.ops',
  appName: 'Switch Ops',
  webDir:  'out',
  android: {
    path:            'android-ops',
    backgroundColor: '#000000',
  },
  server: {
    url:       'https://app.switchlocally.com/ops/login',
    cleartext: false,
  },
}

export default config

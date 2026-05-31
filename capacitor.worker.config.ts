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
    url:       'https://app.switchlocally.com/players',
    cleartext: false,
  },
}

export default config

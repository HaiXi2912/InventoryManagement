import type { RecursiveRequired, Settings } from '#/global'
import { cloneDeep } from 'es-toolkit'
import settingsDefault from '@/settings.default'
import { merge } from '@/utils/object'

const globalSettings: Settings.all = {
  app: {
    routeBaseOn: 'frontend',
  },
  home: {
    enable: true,
    title: '进销存管理',
    fullPath: '/',
  },
  menu: {
    baseOn: 'frontend',
  },
}

export default merge(globalSettings, cloneDeep(settingsDefault)) as RecursiveRequired<Settings.all>

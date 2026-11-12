/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_DEV_SERVER_URL?: string
    WENSHU_BIND?: string
    WENSHU_PORT?: string
    WENSHU_SOFFICE?: string
  }
}

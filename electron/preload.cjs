// 온보딩 렌더러 ↔ 메인 프로세스 IPC 브리지 (CommonJS — preload는 CJS로 로드)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('office', {
  checkClaude: () => ipcRenderer.invoke('check-claude'),
  installClaude: () => ipcRenderer.invoke('install-claude'),
  authStatus: () => ipcRenderer.invoke('auth-status'),
  authLogin: () => ipcRenderer.invoke('auth-login'),
  getCompany: () => ipcRenderer.invoke('get-company'),
  saveCompany: (info) => ipcRenderer.invoke('save-company', info),
  startApp: () => ipcRenderer.invoke('start-app'),
  onInstallLog: (cb) => ipcRenderer.on('install-log', (_e, line) => cb(line))
})

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('barkever', {
  ask: (req) => ipcRenderer.invoke('barkever:ask', req),
  edit: (req) => ipcRenderer.invoke('barkever:edit', req),
  setAi: (on) => ipcRenderer.invoke('barkever:ai', on),
})

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('barkever', {ask: (req) => ipcRenderer.invoke('barkever:ask', req)})

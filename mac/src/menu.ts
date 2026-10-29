import {BrowserWindow, Menu} from 'electron'

const PRESS_NEW = `dispatchEvent(new KeyboardEvent('keydown', {key: 'n', metaKey: true, bubbles: true, cancelable: true}))`

export function newNote() {
  return BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript(PRESS_NEW)
}

export function installMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {role: 'appMenu'},
      {label: 'File', submenu: [{id: 'new-note', label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => void newNote()}, {type: 'separator'}, {role: 'close'}]},
      {role: 'editMenu'},
      {role: 'viewMenu'},
      {role: 'windowMenu'},
    ]),
  )
}

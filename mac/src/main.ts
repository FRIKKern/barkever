import {app, BrowserWindow, dialog, safeStorage, shell, utilityProcess, type UtilityProcess} from 'electron'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {installMenu} from './menu.ts'
import {HOST, installPort} from './port.ts'
import {serverEnv} from './server-env.ts'
import {keepSession} from './keep-session.ts'
import {knownPath, loginShellPath, mergePath} from './shell-path.ts'
import {openVault} from './vault.ts'

const DIST = fileURLToPath(new URL('../../app/dist', import.meta.url))
const SERVER = fileURLToPath(new URL('./server.ts', import.meta.url))

if (process.env.BARKEVER_USER_DATA) app.setPath('userData', process.env.BARKEVER_USER_DATA)

function startServer(port: number, env: Record<string, string>): Promise<UtilityProcess> {
  const child = utilityProcess.fork(SERVER, [String(port), DIST], {env, serviceName: 'Barkever server', stdio: 'inherit'})
  return new Promise((done, fail) => {
    child.once('message', (m: {ready?: string; error?: string}) => (m.ready ? done(child) : fail(new Error(m.error))))
    child.once('exit', (code) => fail(new Error(`the server stopped (exit ${code})`)))
  })
}

const web = (url: string) => /^https?:/.test(url)

function open(origin: string) {
  const win = new BrowserWindow({width: 1280, height: 820, minWidth: 640, minHeight: 480, title: 'Barkever', show: false})
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({url}) => (web(url) && void shell.openExternal(url), {action: 'deny'}))
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin === origin) return
    e.preventDefault()
    if (web(url)) void shell.openExternal(url)
  })
  void win.loadURL(origin)
}

async function start() {
  await app.whenReady()
  installMenu()
  const data = app.getPath('userData')
  const home = app.getPath('home')
  const vault = openVault(join(data, 'vault.bin'), safeStorage)
  const port = await installPort(join(data, 'port'))
  const origin = `http://${HOST}:${port}`
  const server = await startServer(port, serverEnv(process.env, vault.secret, knownPath(home)))
  app.on('will-quit', () => server.kill())
  void loginShellPath().then((path) => path && server.postMessage({path: mergePath(path, knownPath(home))}))
  await keepSession(origin, vault)
  open(origin)
  app.on('activate', () => BrowserWindow.getAllWindows().length || open(origin))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus())
  app.on('window-all-closed', () => process.platform === 'darwin' || app.quit())
  start().catch((e: Error) => {
    dialog.showErrorBox('Barkever could not start', e.message)
    app.exit(1)
  })
}

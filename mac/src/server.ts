import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {setTimeout as sleep} from 'node:timers/promises'
import {serve, type Server, type ServerHandler} from 'srvx'
import {serveStatic} from 'srvx/static'
import {HOST} from './port.ts'

const [port, dist] = process.argv.slice(2) as [string, string]
const parent = process.parentPort
const RETRIES = 25

parent.on('message', (e: {data: {path?: string}}) => {
  if (e.data.path) process.env.PATH = e.data.path
})

async function listen(fetch: ServerHandler): Promise<Server> {
  for (let tries = 0; ; tries++) {
    const server = serve({port: Number(port), hostname: HOST, silent: true, fetch, middleware: [serveStatic({dir: join(dist, 'client')})]})
    try {
      return await server.ready()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || tries === RETRIES) throw e
      await sleep(200)
    }
  }
}

try {
  const start = (await import(pathToFileURL(join(dist, 'server/server.js')).href)).default as {fetch: ServerHandler}
  const server = await listen((req) => start.fetch(req))
  parent.postMessage({ready: server.url})
} catch (e) {
  parent.postMessage({error: e instanceof Error ? e.message : String(e)})
}

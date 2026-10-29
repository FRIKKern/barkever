import {createFileRoute} from '@tanstack/react-router'
import {canvasFiles} from '../server/canvas'

export const Route = createFileRoute('/editor-files')({
  server: {handlers: {GET: async () => Response.json(await canvasFiles(), {headers: {'cache-control': 'no-cache'}})}},
})

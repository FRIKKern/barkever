import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/assets/$')({
  server: {handlers: {GET: () => new Response('not found', {status: 404})}},
})

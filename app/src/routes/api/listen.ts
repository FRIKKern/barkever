import {createFileRoute} from '@tanstack/react-router'
import {listen} from '../../server/sync'

export const Route = createFileRoute('/api/listen')({
  server: {handlers: {GET: ({request}) => listen(new URL(request.url).searchParams.get('since'), request.signal)}},
})

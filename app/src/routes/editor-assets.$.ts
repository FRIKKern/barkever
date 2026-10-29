import {createFileRoute} from '@tanstack/react-router'
import {canvasAsset} from '../server/canvas'

export const Route = createFileRoute('/editor-assets/$')({
  server: {handlers: {GET: ({params}) => canvasAsset(params._splat ?? '')}},
})

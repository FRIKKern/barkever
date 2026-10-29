import {createFileRoute} from '@tanstack/react-router'
import {signOut} from '../server/session'

export const Route = createFileRoute('/sign-out')({
  server: {
    handlers: {
      POST: async () => {
        await signOut()
        return new Response(null, {status: 303, headers: {location: '/sign-in'}})
      },
    },
  },
})

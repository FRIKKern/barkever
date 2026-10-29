import {createFileRoute} from '@tanstack/react-router'
import {libraryQuery, prefsQuery} from '../lib/library'
import {parseSearch} from '../lib/scope'
import {Shell} from '../ui/Shell'

export const Route = createFileRoute('/')({
  ssr: false,
  validateSearch: parseSearch,
  loader: ({context}) => Promise.all([context.queryClient.ensureQueryData(libraryQuery), context.queryClient.ensureQueryData(prefsQuery)]),
  component: Home,
})

function Home() {
  return <Shell s={Route.useSearch()} />
}

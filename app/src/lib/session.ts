import {queryOptions} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {signIn, whoAmI, type Me, type SignIn} from '../server/session'

const fetchMe = createServerFn({method: 'GET'}).handler(() => whoAmI())

export const meQuery = queryOptions({queryKey: ['me'], staleTime: Infinity, queryFn: (): Promise<Me> => fetchMe()})

export const signInFn = createServerFn({method: 'POST'})
  .validator((d: SignIn) => d)
  .handler(({data}) => signIn(data))

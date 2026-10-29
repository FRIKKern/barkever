import {createRoot} from 'react-dom/client'
import {QueryClientProvider} from '@tanstack/react-query'
import {qc} from './replica'
import {App} from './App'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <App />
  </QueryClientProvider>,
)

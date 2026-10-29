import { createRoot } from 'react-dom/client'
import { SET, marks, notes, ready, revs } from './db.js'
import { executor, flush, stats } from './outbox.js'
import { samples } from './timing.js'
import { App } from './App.jsx'

window.__spike = { SET, marks, samples, notes, revs, executor, stats, flush }
await Promise.all([ready(), executor.waitForInit()])
createRoot(document.getElementById('root')).render(<App />)

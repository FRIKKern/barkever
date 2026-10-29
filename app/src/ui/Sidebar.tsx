import {useEffect, useRef, type FormEvent} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {forgetDevice} from '../replica/local'
import {dismissDropped, droppedStarsQuery, stuckQuery} from '../lib/library'
import {useUnsynced} from '../lib/saver'
import {forgetOwner} from '../lib/owner'
import {Link} from '@tanstack/react-router'
import {UNTITLED, type Notebook} from '../lib/model'
import type {Reach} from '../lib/online'
import type {Search} from '../lib/scope'
import {Icon} from './icons'
import {MiniMap} from './MiniMap'
import {SideTags} from './SideTags'
import {toggleTheme} from './local-prefs'
import type {World} from './world'

function signOut(e: FormEvent<HTMLFormElement>, pending: number | null) {
  e.preventDefault()
  const form = e.currentTarget
  if (pending && !confirm(`${pending} ${pending === 1 ? 'change has' : 'changes have'} not reached Barkpark yet. Sign out and lose ${pending === 1 ? 'it' : 'them'}?`)) return
  void Promise.all([forgetDevice(), forgetOwner()]).then(() => form.submit())
}
const RECENT_SHOWN = 5

const AWAY = {offline: 'Offline', unreachable: 'Can’t reach Barkpark'}
const footLine = (reach: Reach, pending: number | null) => {
  if (reach !== 'online') return pending ? `${AWAY[reach]} · ${pending} to sync` : AWAY[reach]
  return pending === null ? 'Syncing' : pending ? `Syncing ${pending}` : 'Synced'
}

type Props = {w: World; s: Search; reach: Reach; modal: boolean; onNew: (() => void) | null; onPick: (note?: string) => void}

export function Sidebar({w, s, reach, modal, onNew, onPick}: Props) {
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    if (modal) self.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
  }, [modal])
  const pending = useUnsynced()
  const stuck = useQuery(stuckQuery).data ?? []
  const dropped = useQuery(droppedStarsQuery).data ?? []
  const qc = useQueryClient()
  const {lib, shelf, prefs, links, perNotebook, tags} = w
  const count = (id: string) => shelf.scope(id).reduce((sum, nb) => sum + (perNotebook.get(nb) ?? 0), 0)
  const scoped = !s.q && (s.nb || s.tag)
  const nbItem = (nb: Notebook, child = false) => (
    <Link key={nb.id} to="/" search={{nb: nb.id}} onClick={() => onPick()} className={`si${child ? ' child' : ''}${!s.q && s.nb === nb.id ? ' on' : ''}`} data-testid="side-notebook">
      <span className="dot" style={{background: shelf.colour(nb.id)}} />
      <span className="t">{nb.name}</span>
      <span className="n">{count(nb.id)}</span>
    </Link>
  )
  const noteItem = (id: string, icon: 'star' | 'clock', testid: string) => {
    const n = links.byId.get(id)
    const nb = shelf.byId.get(id)
    if (!n && !nb) return null
    return (
      <Link key={id} to="/" search={n ? {...s, q: undefined, n: id} : {nb: id}} onClick={() => onPick(n && id)} className={`si${s.n === id ? ' on' : ''}`} data-testid={testid}>
        <Icon name={icon} />
        <span className="t">{n ? n.title || UNTITLED : nb!.name}</span>
      </Link>
    )
  }
  const shortcuts = prefs.shortcuts.map((id) => noteItem(id, 'star', 'side-shortcut')).filter(Boolean)
  const recents = prefs.recents.filter((id) => links.byId.has(id)).slice(0, RECENT_SHOWN)

  return (
    <aside ref={self} className="sidebar" aria-label="Notebooks" role={modal ? 'dialog' : undefined} aria-modal={modal || undefined}>
      <div className="bar">
        <div className="brand">
          <Icon name="brand" />
          Barkever
        </div>
      </div>
      <button className="new-note" onClick={onNew ?? undefined} disabled={!onNew} data-testid="new-note">
        <Icon name="plus" />
        New note
        <kbd>N</kbd>
      </button>
      <nav className="side-scroll">
        <Link to="/" search={{}} onClick={() => onPick()} className={`si${scoped || s.q ? '' : ' on'}`} data-testid="side-all">
          <Icon name="notes" />
          All notes
          <span className="n">{lib.notes.length}</span>
        </Link>
        <div className="side-h">Notebooks</div>
        {shelf.roots.map((nb) => [nbItem(nb), ...shelf.children(nb.id).map((c) => nbItem(c, true))])}
        <div className="side-h">Shortcuts</div>
        {shortcuts.length ? shortcuts : <div className="side-none">Star a note to keep it here.</div>}
        {dropped.map((x) => (
          <div key={x.id} className="side-dropped" data-testid="star-dropped" role="status">
            <span className="t">
              Not {x.on ? 'starred' : 'unstarred'}: {links.byId.get(x.id)?.title || UNTITLED}, Barkpark refused it ({x.status})
            </span>
            <button className="icon-btn" onClick={() => dismissDropped(qc, x.id)} aria-label="Dismiss" data-testid="star-dropped-dismiss">
              ×
            </button>
          </div>
        ))}
        {recents.length > 0 && <div className="side-h">Recent</div>}
        {recents.map((id) => noteItem(id, 'clock', 'side-recent'))}
        <SideTags tags={tags} s={s} onPick={() => onPick()} />
        <MiniMap w={w} sel={s.n} />
      </nav>
      <div className="side-foot">
        <span className={`dot${reach === 'online' ? '' : ' off'}`} />
        <span data-testid="sync-status">{footLine(reach, pending)}</span>
        {stuck.length > 0 && (
          <span className="stuck" data-testid="sync-stuck" title={stuck.map((x) => `${x.id}: ${x.why}`).join('\n')}>
            · {stuck.length} not accepted, retrying
          </span>
        )}
        <button className="icon-btn" onClick={toggleTheme} title="Light / dark" aria-label="Toggle theme">
          <Icon name="theme" />
        </button>
        <form method="post" action="/sign-out" onSubmit={(e) => signOut(e, pending)}>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" data-testid="sign-out">
            <Icon name="out" />
          </button>
        </form>
      </div>
    </aside>
  )
}

import {useEffect, useRef, type FormEvent} from 'react'
import {useQuery} from '@tanstack/react-query'
import {forgetDevice} from '../replica/local'
import {pendingQuery, stuckQuery} from '../lib/library'
import {forgetOwner} from '../lib/owner'
import {Link} from '@tanstack/react-router'
import {UNTITLED, type Notebook} from '../lib/model'
import type {Reach} from '../lib/online'
import type {Search} from '../lib/scope'
import {Icon} from './icons'
import {MiniMap} from './MiniMap'
import {toggleTheme} from './local-prefs'
import type {World} from './world'

const TOP_TAGS = 8

function signOut(e: FormEvent<HTMLFormElement>, pending: number) {
  e.preventDefault()
  const form = e.currentTarget
  if (pending && !confirm(`${pending} ${pending === 1 ? 'change has' : 'changes have'} not reached Barkpark yet. Sign out and lose ${pending === 1 ? 'it' : 'them'}?`)) return
  void Promise.all([forgetDevice(), forgetOwner()]).then(() => form.submit())
}
const RECENT_SHOWN = 5

const AWAY = {offline: 'Offline', unreachable: 'Can’t reach Barkpark'}
const footLine = (reach: Reach, pending: number) => (reach === 'online' ? (pending ? `Syncing ${pending}` : 'Synced') : pending ? `${AWAY[reach]} · ${pending} to sync` : AWAY[reach])

type Props = {w: World; s: Search; reach: Reach; modal: boolean; onNew: (() => void) | null; onPick: (note?: string) => void}

export function Sidebar({w, s, reach, modal, onNew, onPick}: Props) {
  const self = useRef<HTMLElement>(null)
  useEffect(() => {
    if (modal) self.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
  }, [modal])
  const pending = useQuery(pendingQuery).data?.size ?? 0
  const stuck = useQuery(stuckQuery).data ?? []
  const {lib, shelf, prefs, links} = w
  const count = (id: string) => lib.notes.filter((n) => n.notebook && shelf.scope(id).includes(n.notebook)).length
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
  const tags = Object.entries(lib.notes.flatMap((n) => n.tags).reduce<Record<string, number>>((a, t) => ((a[t] = (a[t] ?? 0) + 1), a), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_TAGS)
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
        {recents.length > 0 && <div className="side-h">Recent</div>}
        {recents.map((id) => noteItem(id, 'clock', 'side-recent'))}
        {tags.length > 0 && <div className="side-h">Tags</div>}
        <div className="tags">
          {tags.map(([t]) => (
            <Link key={t} to="/" search={{tag: t}} onClick={() => onPick()} className={`tag${!s.q && s.tag === t ? ' on' : ''}`}>
              #{t}
            </Link>
          ))}
        </div>
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

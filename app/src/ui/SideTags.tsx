import {useState} from 'react'
import {Link} from '@tanstack/react-router'
import {sameTag, type Search} from '../lib/scope'

const TOP_TAGS = 8

type Props = {tags: [string, number][]; s: Search; onPick: () => void}

export function SideTags({tags, s, onPick}: Props) {
  const [all, setAll] = useState(false)
  if (!tags.length) return null
  const on = !s.q && s.tag
  const shown = all ? tags : tags.filter(([t], i) => i < TOP_TAGS || (on && sameTag(t, on)))
  const hidden = tags.length - shown.length
  return (
    <>
      <div className="side-h">Tags</div>
      <div className="tags">
        {shown.map(([t]) => (
          <Link key={t} to="/" search={{tag: t}} onClick={onPick} className={`tag${on && sameTag(t, on) ? ' on' : ''}`} data-testid="side-tag">
            #{t}
          </Link>
        ))}
        {(hidden > 0 || all) && (
          <button className="tag more-tags" onClick={() => setAll(!all)} aria-expanded={all} data-testid="side-tags-more">
            {all ? 'Fewer' : `+${hidden} more`}
          </button>
        )}
      </div>
    </>
  )
}

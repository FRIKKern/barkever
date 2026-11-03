import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {Window} from 'happy-dom'
import {Blocks} from '../src/ui/Blocks'
import {MISSING, conform, counts, diffShapes, modeFromEnv, settle, shapeOf} from '../../conformance/pack/conformance.mjs'

const PACK = new URL('../../conformance/pack/goldens', import.meta.url).pathname
const REPORT = new URL('../../conformance/barkever-blocks.json', import.meta.url).pathname
const KNOWN = new Set(['blockquote', 'heading', 'list', 'paragraph'])
const search = {n: undefined, q: undefined, b: undefined, t: undefined, conflict: undefined}

function nodesOf(html: string): NodeList {
  const document = new Window().document
  document.body.innerHTML = html
  const wrapper = document.body.children.length === 1 ? document.body.firstElementChild : null
  return (wrapper?.classList.contains('blocks') ? wrapper.childNodes : document.body.childNodes) as unknown as NodeList
}

function judge(golden: {type: string; input: unknown; expectedHtml: string}) {
  if (!KNOWN.has(golden.type)) return MISSING
  const block = {...(golden.input as object), id: 'conformance'}
  const actual = renderToStaticMarkup(createElement(Blocks, {blocks: [block], s: search, title: () => undefined} as never))
  return diffShapes(shapeOf(nodesOf(actual)), shapeOf(nodesOf(golden.expectedHtml)))
}

async function main() {
  try {
    const report = await conform({renderer: 'barkever-blocks', compare: 'dom', judge, pack: process.env.CONFORMANCE_PACK || PACK})
    const problems = settle(report, {...modeFromEnv(), path: REPORT})
    const result = counts(report)
    console.log(`barkever-blocks: ${result.pass} pass, ${result.fail} fail, ${result.missing} missing, ${result.unchecked} unchecked of ${report.rows.length}`)
    problems.forEach((problem: string) => console.error(problem))
    process.exitCode = problems.length ? 1 : 0
  } catch (error) {
    console.error(`barkever-blocks: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}

void main()

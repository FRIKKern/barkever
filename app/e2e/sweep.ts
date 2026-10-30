import {cli} from './account.ts'
import {drop, sweep} from './drop.ts'
import {bp} from './seed.ts'

const {server, token} = cli()
const listed = await fetch(`${server}/api/workspaces/barkever/projects/default/datasets`, {headers: {authorization: `Bearer ${token}`}})
if (!(await sweep(listed, Date.now(), process.argv.includes('--yes'), (name) => drop(name, bp), console.log))) process.exitCode = 1

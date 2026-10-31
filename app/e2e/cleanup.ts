import {rmSync} from 'node:fs'
import {join} from 'node:path'
import type {FullResult, Reporter} from '@playwright/test/reporter'
import {APP} from './run.ts'
import {drop, dropEach, toDrop} from './drop.ts'
import {bp} from './seed.ts'

const REPORTER_CAP_MS = 2 * 60_000

export default class Cleanup implements Reporter {
  dataset: string
  also: string[]
  ran = false

  constructor({dataset, also = []}: {dataset: string; also?: string[]}) {
    this.dataset = dataset
    this.also = also
  }

  onTestBegin() {
    this.ran = true
  }

  async onEnd({status}: FullResult) {
    rmSync(join(APP, 'dist', this.dataset), {recursive: true, force: true})
    rmSync(join(APP, 'e2e/.auth', `${this.dataset}.json`), {force: true})
    if (!this.ran) return
    const {drop: mine, kept} = toDrop([this.dataset, ...this.also], status, process.pid)
    for (const line of kept) console.log(line)
    await dropEach(mine, (d) => drop(d, bp, 2_000, REPORTER_CAP_MS), console.log)
  }
}

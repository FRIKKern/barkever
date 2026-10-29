import {rmSync} from 'node:fs'
import {join} from 'node:path'
import type {FullResult, Reporter} from '@playwright/test/reporter'
import {APP} from './run.ts'
import {drop, ownRun} from './seed.ts'

export default class Cleanup implements Reporter {
  dataset: string
  also: string[]

  constructor({dataset, also = []}: {dataset: string; also?: string[]}) {
    this.dataset = dataset
    this.also = also
  }

  async onEnd({status}: FullResult) {
    rmSync(join(APP, 'dist', this.dataset), {recursive: true, force: true})
    rmSync(join(APP, 'e2e/.auth', `${this.dataset}.json`), {force: true})
    if (status !== 'passed') return console.log(`kept ${this.dataset} to look at`)
    for (const d of [this.dataset, ...this.also]) console.log(ownRun(d) ? await drop(d) : `kept ${d}: this run did not make it`)
  }
}

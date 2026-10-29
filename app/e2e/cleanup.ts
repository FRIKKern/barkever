import {rmSync} from 'node:fs'
import {join} from 'node:path'
import type {FullResult, Reporter} from '@playwright/test/reporter'
import {APP} from './run.ts'
import {drop} from './seed.ts'

export default class Cleanup implements Reporter {
  dataset: string

  constructor({dataset}: {dataset: string}) {
    this.dataset = dataset
  }

  async onEnd({status}: FullResult) {
    rmSync(join(APP, 'dist', this.dataset), {recursive: true, force: true})
    rmSync(join(APP, 'e2e/.auth', `${this.dataset}.json`), {force: true})
    if (status === 'passed') await drop(this.dataset)
    else console.log(`kept ${this.dataset} to look at`)
  }
}

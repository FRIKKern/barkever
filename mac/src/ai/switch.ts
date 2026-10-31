import {existsSync, readFileSync, writeFileSync} from 'node:fs'

export const AI_OFF = 'AI is off. Nothing leaves this Mac.'

export type AiSwitch = {on(): boolean; set(on: boolean): void}

export const aiSwitch = (file: string): AiSwitch => ({
  on: () => !existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).on === true,
  set: (on) => writeFileSync(file, JSON.stringify({on})),
})

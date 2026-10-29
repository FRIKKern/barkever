import tokens from '../../../design/tokens.json' with {type: 'json'}

type Group = Record<string, string>
export type Tokens = {light: Group; dark: Group} & Record<string, Group>

const block = (group: Group) => Object.entries(group).map(([k, v]) => `--${k}: ${v};`).join(' ')

export function toCss({light, dark, ...scales}: Tokens): string {
  const base = Object.values(scales).map(block).join(' ')
  return [
    `:root { ${base} ${block(light)} color-scheme: light; }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${block(dark)} color-scheme: dark; } }`,
    `:root[data-theme="dark"] { ${block(dark)} color-scheme: dark; }`,
  ].join('\n')
}

export const tokenCss = toCss(tokens as Tokens)

export const sizePx = (k: keyof typeof tokens.size) => parseFloat(tokens.size[k])

export const NOTEBOOK_COLOURS = Object.keys(tokens.light).filter((k) => k.startsWith('nb-')).length

export const THEME_KEY = 'barkever.theme'

export const themeBoot = `try{var t=localStorage.getItem('${THEME_KEY}');if(t)document.documentElement.dataset.theme=t}catch(e){}`

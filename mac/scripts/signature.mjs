export function signedBy(codesignDv) {
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(codesignDv)?.[1].split(',') ?? []
  const authority = /^Authority=(.+)$/m.exec(codesignDv)?.[1]
  return {
    runtime: flags.includes('runtime'),
    developerId: Boolean(authority?.startsWith('Developer ID Application: ')),
    label: authority ?? (flags.includes('adhoc') ? 'signed ad hoc' : 'unsigned'),
  }
}

export function assertSigned(signer, name) {
  if (!signer.runtime) throw new Error(`the app is ${signer.label} without the hardened runtime`)
  const wanted = name ? `Developer ID Application: ${name}` : 'signed ad hoc'
  if (signer.label !== wanted) throw new Error(`expected ${wanted}, the app is ${signer.label}`)
}

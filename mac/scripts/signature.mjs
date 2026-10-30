export function signedBy(codesignDv) {
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(codesignDv)?.[1].split(',') ?? []
  const authority = /^Authority=(Developer ID Application: .+)$/m.exec(codesignDv)?.[1]
  return {
    runtime: flags.includes('runtime'),
    developerId: Boolean(authority),
    label: authority ?? (flags.includes('adhoc') ? 'signed ad hoc' : 'unsigned'),
  }
}

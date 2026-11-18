import {test} from 'node:test'
import assert from 'node:assert/strict'
import {crc32, zip} from './zip.ts'

const bytes = (s: string) => new TextEncoder().encode(s)

function entries(z: Uint8Array) {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const end = z.length - 22
  assert.equal(v.getUint32(end, true), 0x06054b50)
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const out = []
  for (let k = 0; k < count; k++) {
    assert.equal(v.getUint32(at, true), 0x02014b50)
    const nameLen = v.getUint16(at + 28, true)
    const local = v.getUint32(at + 42, true)
    assert.equal(v.getUint32(local, true), 0x04034b50)
    const size = v.getUint32(local + 18, true)
    const localName = v.getUint16(local + 26, true)
    const data = z.slice(local + 30 + localName, local + 30 + localName + size)
    out.push({
      name: new TextDecoder().decode(z.slice(at + 46, at + 46 + nameLen)),
      flags: v.getUint16(at + 8, true),
      method: v.getUint16(at + 10, true),
      crc: v.getUint32(at + 16, true),
      data: new TextDecoder().decode(data),
      sum: crc32(data),
    })
    at += 46 + nameLen
  }
  return out
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array()), 0)
})

test('a zip holds every file stored, named in UTF-8, with its CRC', () => {
  const files = [
    {name: 'Plan.md', data: bytes('# Plan\n')},
    {name: 'Øl på brygga 🚤.md', data: bytes('# Øl\n\nskål\n')},
    {name: 'Empty.md', data: new Uint8Array()},
  ]
  const got = entries(zip(files, new Date(2026, 10, 18, 12, 30, 10)))
  assert.deepEqual(
    got.map((e) => [e.name, e.data, e.method, e.flags & 0x0800]),
    files.map((f) => [f.name, new TextDecoder().decode(f.data), 0, 0x0800]),
  )
  for (const e of got) assert.equal(e.crc, e.sum)
})

test('an empty zip is just the end record', () => {
  assert.equal(zip([]).length, 22)
})

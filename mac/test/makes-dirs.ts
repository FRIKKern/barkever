import {test} from 'node:test'
import {fakeBin, ownerHome, testDir} from '../src/ai/fakes.ts'

testDir('barkever-top-level-')

test('makes the dirs a mac unit test makes', () => {
  fakeBin()
  ownerHome()
  testDir('barkever-ai-')
  if (process.env.PLANT_FAILURE) throw new Error('planted failure')
})

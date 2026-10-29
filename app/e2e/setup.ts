import {DATASET} from './fixtures-cleanup.ts'
import {seed} from './seed.ts'

export default async function setup() {
  await seed(DATASET)
  console.log(`e2e dataset ${DATASET} (barkever/default), seeded with the fixtures`)
}

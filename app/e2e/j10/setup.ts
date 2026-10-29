import {seed} from '../seed.ts'
import {j10Dataset} from './server.ts'

export default async function setup() {
  await seed(j10Dataset())
  console.log(`J10 dataset ${j10Dataset()} (barkever/default), seeded with the fixtures, published`)
}

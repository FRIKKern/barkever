import {createDataset, j10Dataset} from './server.ts'

export default async function setup() {
  await createDataset()
  console.log(`J10 dataset ${j10Dataset()} (barkever/default), seeded with fixtures as drafts`)
}

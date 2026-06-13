import 'fake-indexeddb/auto'
import { closeDB, DB } from '../data/db'

/** Reset to a clean IndexedDB before each test. */
export async function freshDB(): Promise<void> {
  await closeDB()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB.name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

import { afterEach, describe, it, expect, vi } from 'vitest'
import { emitLocalChange, emitStoreChange, onLocalChange, onStoreChange } from './events'

/** Another tab's end of the channel. */
let otherTab: BroadcastChannel | undefined

afterEach(() => {
  otherTab?.close()
  otherTab = undefined
})

function received(channel: BroadcastChannel): unknown[] {
  const messages: unknown[] = []
  channel.onmessage = (event: MessageEvent) => messages.push(event.data)
  return messages
}

describe('store changes across tabs', () => {
  it('a store change is posted to the other tabs', async () => {
    otherTab = new BroadcastChannel('tablemarks')
    const messages = received(otherTab)

    emitStoreChange()

    await vi.waitFor(() => expect(messages).toHaveLength(1))
  })

  it('a user write is posted to the other tabs too, so an added place shows there', async () => {
    otherTab = new BroadcastChannel('tablemarks')
    const messages = received(otherTab)

    emitLocalChange()

    await vi.waitFor(() => expect(messages).toEqual(['store-change']))
  })

  it("another tab's store change refreshes this tab, is not a local change, and is not re-posted", async () => {
    otherTab = new BroadcastChannel('tablemarks')
    const observer = new BroadcastChannel('tablemarks')
    const observed = received(observer)
    const store = vi.fn()
    const local = vi.fn()
    const offStore = onStoreChange(store)
    const offLocal = onLocalChange(local)

    otherTab.postMessage('store-change')

    await vi.waitFor(() => expect(store).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    offStore()
    offLocal()
    observer.close()
    expect(local).not.toHaveBeenCalled()
    expect(observed).toHaveLength(1)
  })
})

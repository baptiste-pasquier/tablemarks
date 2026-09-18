import { beforeEach, describe, it, expect } from 'vitest'
import {
  backendAddressIsKnown,
  backendIsAbsent,
  backendIsUnreachable,
  getBackendStatus,
  onBackendStatusChange,
  setBackendPresence,
  setBackendReachability,
} from './backendStatus'

// Captured at import time, before any test has written: the "read before any write" snapshot.
const initial = getBackendStatus()

beforeEach(() => {
  // No reset export by design (mirrors `syncStatus.ts`) — drive it back via the public API.
  // Going through `absent` guarantees reachability is back to `unknown` whatever the last test left.
  setBackendPresence({ status: 'absent' })
})

describe('initial state', () => {
  it('is defined before any write, and claims neither absence nor reachability', () => {
    expect(initial).toBeDefined()
    expect(initial.presence).toBeDefined()
    // Nothing has been resolved yet: presence must not read as a deliberate "no backend" build...
    expect(initial.presence.status).not.toBe('absent')
    expect(backendIsAbsent(initial)).toBe(false)
    // ...and reachability must not claim a health check that never ran.
    expect(initial.reachability).toBe('unknown')
  })
})

describe('presence', () => {
  it('admits absent, configured, and unavailable — and nothing else', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    expect(getBackendStatus().presence).toEqual({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })

    setBackendPresence({ status: 'unavailable', reason: 'offline at launch' })
    expect(getBackendStatus().presence).toEqual({
      status: 'unavailable',
      reason: 'offline at launch',
    })

    setBackendPresence({ status: 'absent' })
    expect(getBackendStatus().presence).toEqual({ status: 'absent' })
  })

  it('leaves reachability unset when set to absent, rather than defaulting it to reachable', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('reachable')
    expect(getBackendStatus().reachability).toBe('reachable')

    setBackendPresence({ status: 'absent' })
    expect(getBackendStatus().reachability).toBe('unknown')
  })

  it('drops a reachability reading taken against a different address', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://one.example.test',
    })
    setBackendReachability('unreachable')

    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://two.example.test',
    })
    expect(getBackendStatus().reachability).toBe('unknown')
  })

  it('keeps the snapshot identity stable when the same presence is written twice', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    const first = getBackendStatus()
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    expect(getBackendStatus()).toBe(first)
  })
})

describe('an unavailable resolution', () => {
  it('reads as configured-but-unreachable, not as absent (KTD9)', () => {
    setBackendPresence({
      status: 'unavailable',
      reason: 'configuration request timed out',
    })

    expect(backendIsAbsent(getBackendStatus())).toBe(false)
    expect(backendIsUnreachable(getBackendStatus())).toBe(true)
  })

  it('stays distinguishable from a known-address-unreachable one', () => {
    setBackendPresence({
      status: 'unavailable',
      reason: 'configuration request timed out',
    })
    const noAddress = getBackendStatus()

    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('unreachable')
    const knownAddress = getBackendStatus()

    // Both are unreachable...
    expect(backendIsUnreachable(noAddress)).toBe(true)
    expect(backendIsUnreachable(knownAddress)).toBe(true)
    // ...but only one has an address a consumer could sign in against.
    expect(backendAddressIsKnown(noAddress)).toBe(false)
    expect(backendAddressIsKnown(knownAddress)).toBe(true)
  })
})

describe('reachability', () => {
  it('has an unknown state distinct from both reachable and unreachable', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    expect(getBackendStatus().reachability).toBe('unknown')
    // Unknown is neither claim: no indicator, and no false "all good" either.
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)

    setBackendReachability('reachable')
    expect(getBackendStatus().reachability).toBe('reachable')

    setBackendReachability('unreachable')
    expect(getBackendStatus().reachability).toBe('unreachable')

    setBackendReachability('unknown')
    expect(getBackendStatus().reachability).toBe('unknown')
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)
  })

  it('returns to reachable when a successful sync clears it', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('unreachable')
    expect(backendIsUnreachable(getBackendStatus())).toBe(true)

    setBackendReachability('reachable')
    expect(getBackendStatus().reachability).toBe('reachable')
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)
  })

  it('is ignored while no address is known, so an absent backend never reads as a sync problem', () => {
    setBackendPresence({ status: 'absent' })
    setBackendReachability('unreachable')

    expect(getBackendStatus().reachability).toBe('unknown')
    expect(backendIsUnreachable(getBackendStatus())).toBe(false)
    expect(backendIsAbsent(getBackendStatus())).toBe(true)

    setBackendPresence({
      status: 'unavailable',
      reason: 'configuration body is not a JSON object',
    })
    setBackendReachability('reachable')
    // No address was ever health-checked, so no reading may be stored against it.
    expect(getBackendStatus().reachability).toBe('unknown')
  })
})

describe('subscribers', () => {
  it('are notified on a presence change and on a reachability change', () => {
    const seen: string[] = []
    const unsub = onBackendStatusChange(() => {
      const s = getBackendStatus()
      seen.push(`${s.presence.status}/${s.reachability}`)
    })

    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('unreachable')

    expect(seen).toEqual(['configured/unknown', 'configured/unreachable'])
    unsub()
  })

  it('are not notified when a write changes nothing', () => {
    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('reachable')

    let calls = 0
    const unsub = onBackendStatusChange(() => {
      calls += 1
    })

    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    setBackendReachability('reachable')

    expect(calls).toBe(0)
    unsub()
  })

  it('stop being notified once unsubscribed', () => {
    let calls = 0
    const unsub = onBackendStatusChange(() => {
      calls += 1
    })

    setBackendPresence({
      status: 'configured',
      pocketbaseUrl: 'https://pb.example.test',
    })
    expect(calls).toBe(1)

    unsub()
    setBackendReachability('unreachable')
    expect(calls).toBe(1)
  })
})

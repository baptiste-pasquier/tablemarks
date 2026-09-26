import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` (a whole minute by default): one timer for a
 * whole list of open states. The first tick is scheduled for the next whole minute rather than
 * `intervalMs` from mount, so every instance — a list card, the open detail — flips together
 * instead of disagreeing by up to a minute depending on when each one mounted.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const firstTick = intervalMs - (Date.now() % intervalMs)
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), intervalMs)
    }, firstTick)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [intervalMs])
  return now
}

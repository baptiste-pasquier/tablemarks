---
title: Mock react-leaflet's useMap with a stable instance, or effects loop
date: 2026-06-13
category: conventions
module: map UI + tests
problem_type: convention
component: testing_framework
severity: medium
related_components:
  - frontend
applies_when:
  - Mocking react-leaflet (or any hook returning an instance/object) in component tests
  - A component runs an effect whose dependency array includes a hook-returned object
  - Testing a component that uses useMap / useMapEvents under jsdom
tags:
  - react-leaflet
  - testing
  - vitest
  - react-effects
  - mocking
  - jsdom
---

# Mock react-leaflet's useMap with a stable instance, or effects loop

## Context

Components that use react-leaflet (`useMap`, map events) can't render under jsdom — Leaflet needs real DOM dimensions — so the shell test mocks `react-leaflet`. While building the decision mode, the mock's `useMap` returned a **fresh object on every call**:

```ts
vi.mock('react-leaflet', () => ({
  // ...
  useMap: () => ({ setView: () => {}, getZoom: () => 12, getCenter: () => ({ lat: 0, lng: 0 }) }),
}))
```

A child component reported the map center via `useEffect(report, [map])`. Because the mocked `map` had a new identity every render, the effect re-ran on every render, called `setState` (the anchor), which re-rendered, which produced a new `map`, which re-ran the effect — an infinite loop. The symptom was silent: no error, the test run just hung until it was killed minutes later, looking like a slow/stuck suite rather than a bug.

## Guidance

When mocking `react-leaflet` (or any hook that real code expects to return a referentially **stable** instance), build the instance **once** in the mock factory's module scope and return the same reference from every call. Include every method the components under test invoke:

```ts
vi.mock('react-leaflet', () => {
  // Stable instance — real react-leaflet returns the same Map across renders.
  const map = {
    setView: () => {},
    getZoom: () => 12,
    getCenter: () => ({ lat: 0, lng: 0 }),
    on: () => {},
    off: () => {},
  }
  return {
    MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    TileLayer: () => null,
    Marker: () => null,
    Popup: () => null,
    useMap: () => map,
  }
})
```

Complementary production-side habit: prefer subscribing to map events **once** in an effect keyed on the stable instance (`map.on('moveend', ...)` with an `off` cleanup) over passing a fresh handler object to `useMapEvents` every render — the latter re-binds on every render and is the same instability one layer up.

## Why This Matters

The bug never reaches production — real `react-leaflet` returns a stable `useMap`, so the loop is purely a test artifact. That's exactly why it's dangerous: it only appears in CI/local test runs, where an infinite render loop presents as "the suite hung," not as a failing assertion pointing at a cause. Minutes were lost to a killed run before the unstable-mock identity was spotted. Any future map-adjacent component test reintroduces it unless the mock returns a stable instance.

## When to Apply

- Any time `react-leaflet` is mocked in a Vitest/jsdom component test.
- More generally: when mocking a hook whose real return value is a stable instance and the consuming component has an effect with that value in its dependency array. The mock must preserve the stability the real API guarantees.

## Examples

Before — fresh object each call, effect keyed on `[map]` loops forever (test hangs):

```ts
useMap: () => ({ setView: () => {}, getZoom: () => 12, getCenter: () => ({ lat: 0, lng: 0 }) })
```

After — one module-scoped instance, returned every call (effect runs once on mount):

```ts
const map = { setView: () => {}, getZoom: () => 12, getCenter: () => ({ lat: 0, lng: 0 }), on: () => {}, off: () => {} }
// ...
useMap: () => map
```

## Related

- `src/App.test.tsx` (the mock), `src/features/map/MapView.tsx` (the `CenterReporter` effect that exposed it).
- Adjacent React-effect-stability lesson in the same subsystem: `docs/solutions/architecture-patterns/restart-controllers-on-startup.md` (bootstrap/lifecycle) is unrelated in cause but both concern getting effect/lifecycle wiring right.

import { VERDICTS, type Restaurant, type Verdict, type Visit } from '../types/models'

/** Coerce a remote string to a known Verdict, guarding against corrupt/drifted remote data. */
function asVerdict(value: string | null | undefined): Verdict | null {
  return value && (VERDICTS as readonly string[]).includes(value) ? (value as Verdict) : null
}

// PocketBase record shapes. Two fields are renamed vs the local model:
//   local `updated`      -> remote `syncedAt`   (PB reserves `updated` as a system autodate field)
//   local `restaurantId` -> remote `restaurant` (PB relation)
// and `owner` is added on push (absent locally — no-account mode has no owner).

export interface RemoteRestaurant {
  id: string
  owner?: string
  name: string
  lat: number | null
  lng: number | null
  address?: string
  mapsUrl?: string
  cuisine?: string
  note?: string
  added?: string
  pending: boolean
  latestVerdict: string | null
  latestVisitDate: string | null
  visitCount: number
  syncedAt: string
  deleted: boolean
}

export interface RemoteVisit {
  id: string
  owner?: string
  restaurant: string
  date: string
  verdict: string
  note?: string
  syncedAt: string
  deleted: boolean
}

export function restaurantToRemote(r: Restaurant, owner: string): RemoteRestaurant {
  return {
    id: r.id,
    owner,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    mapsUrl: r.mapsUrl,
    cuisine: r.cuisine,
    note: r.note,
    added: r.added,
    pending: r.pending,
    latestVerdict: r.latestVerdict,
    latestVisitDate: r.latestVisitDate,
    visitCount: r.visitCount,
    syncedAt: r.updated,
    deleted: r.deleted,
  }
}

export function restaurantFromRemote(r: RemoteRestaurant): Restaurant {
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    mapsUrl: r.mapsUrl,
    cuisine: r.cuisine,
    note: r.note,
    added: r.added,
    pending: r.pending,
    latestVerdict: asVerdict(r.latestVerdict),
    latestVisitDate: r.latestVisitDate,
    visitCount: r.visitCount,
    updated: r.syncedAt,
    deleted: r.deleted,
  }
}

export function visitToRemote(v: Visit, owner: string): RemoteVisit {
  return {
    id: v.id,
    owner,
    restaurant: v.restaurantId,
    date: v.date,
    verdict: v.verdict,
    note: v.note,
    syncedAt: v.updated,
    deleted: v.deleted,
  }
}

export function visitFromRemote(v: RemoteVisit): Visit {
  return {
    id: v.id,
    restaurantId: v.restaurant,
    date: v.date,
    verdict: asVerdict(v.verdict) ?? 'once_was_enough',
    note: v.note,
    updated: v.syncedAt,
    deleted: v.deleted,
  }
}

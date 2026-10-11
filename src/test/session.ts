import { pb } from '../sync/pocketbase'

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Saves a session for `userId`. `pb.authStore.isValid` decodes the token's payload and checks
 * `exp`, so the token is a real (unsigned) `header.payload.sig` whose `exp` is one hour ahead by
 * default; a negative `expiresInSeconds` saves an already-expired session.
 */
export function fakeSession(userId: string, expiresInSeconds = 3600): void {
  const token = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      id: userId,
      type: 'auth',
      collectionId: 'users',
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    }),
    'not-verified-client-side',
  ].join('.')
  pb.authStore.save(token, {
    id: userId,
    email: `${userId}@test.local`,
    collectionId: 'users',
    collectionName: 'users',
  })
}

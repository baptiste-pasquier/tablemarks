/// <reference path="../pb_data/types.d.ts" />

// Tablemarks collections: restaurants + visits.
// Records carry client-supplied ids and the sync fields (updated, deleted).
// Targets the PocketBase v0.26 JS migration API; verify field shapes against the
// running binary if the version differs.

migrate(
  (app) => {
    const restaurants = new Collection({
      type: 'base',
      name: 'restaurants',
      // Per-user ownership; rules scope every record to its owner.
      listRule: 'owner = @request.auth.id',
      viewRule: 'owner = @request.auth.id',
      createRule: 'owner = @request.auth.id',
      updateRule: 'owner = @request.auth.id',
      deleteRule: 'owner = @request.auth.id',
      fields: [
        { name: 'owner', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
        { name: 'name', type: 'text', required: true },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'address', type: 'text' },
        { name: 'mapsUrl', type: 'text' },
        { name: 'cuisine', type: 'text' },
        { name: 'note', type: 'text' },
        { name: 'pending', type: 'bool' },
        { name: 'latestVerdict', type: 'text' },
        { name: 'latestVisitDate', type: 'text' },
        { name: 'visitCount', type: 'number' },
        // Sync fields. `updated` is the last-write-wins key; managed by the client,
        // so it is NOT the autodate system field.
        { name: 'syncedAt', type: 'text' },
        { name: 'deleted', type: 'bool' },
      ],
    })
    app.save(restaurants)

    const visits = new Collection({
      type: 'base',
      name: 'visits',
      listRule: 'owner = @request.auth.id',
      viewRule: 'owner = @request.auth.id',
      createRule: 'owner = @request.auth.id',
      updateRule: 'owner = @request.auth.id',
      deleteRule: 'owner = @request.auth.id',
      fields: [
        { name: 'owner', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
        { name: 'restaurant', type: 'relation', required: true, collectionId: restaurants.id, maxSelect: 1, cascadeDelete: false },
        { name: 'date', type: 'text', required: true },
        { name: 'verdict', type: 'text', required: true },
        { name: 'note', type: 'text' },
        { name: 'syncedAt', type: 'text' },
        { name: 'deleted', type: 'bool' },
      ],
      indexes: ['CREATE INDEX idx_visits_restaurant ON visits (restaurant)'],
    })
    app.save(visits)
  },
  (app) => {
    for (const name of ['visits', 'restaurants']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {
        // already gone
      }
    }
  },
)

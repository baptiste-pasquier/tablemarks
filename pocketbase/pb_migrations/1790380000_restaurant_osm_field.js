/// <reference path="../pb_data/types.d.ts" />

// Adds `osm` to `restaurants`: the read-only OpenStreetMap snapshot (see
// docs/reference/data-model.md). One JSON field rather than a column per tag, so a later tag
// needs no migration. Owner-scoped rules on the collection already cover it.

migrate(
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.add(new JSONField({ name: 'osm', required: false, maxSize: 8192 }))
    app.save(restaurants)
  },
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.removeByName('osm')
    app.save(restaurants)
  },
)

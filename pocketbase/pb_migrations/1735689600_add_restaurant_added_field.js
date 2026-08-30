/// <reference path="../pb_data/types.d.ts" />

// Adds the `added` field (creation timestamp, client-stamped, never renamed) to `restaurants`.
// See pb_migrations/1718200000_init_collections.js for the original collection definition.

migrate(
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.add(new TextField({ name: 'added', required: false }))
    app.save(restaurants)
  },
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.removeByName('added')
    app.save(restaurants)
  },
)

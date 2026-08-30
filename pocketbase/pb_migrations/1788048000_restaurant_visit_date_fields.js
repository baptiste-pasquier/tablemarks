/// <reference path="../pb_data/types.d.ts" />

// Retypes `restaurants.added`, `restaurants.syncedAt`, and `visits.syncedAt` from
// `text` to PocketBase's native `date` field, since these are genuine instants
// (not local-calendar days). `visits.date` and `restaurants.latestVisitDate` stay
// `text` in the `YYYY-MM-DD` shape and are untouched here.
// See pb_migrations/1718200000_init_collections.js and
// pb_migrations/1735689600_add_restaurant_added_field.js for the original fields.
//
// NOTE: a field type change is not data-preserving in PocketBase — removing then
// re-adding a field resets every existing row's value for that field to empty.
// This is expected; this repo makes no promise to preserve local dev data.

migrate(
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.removeByName('added')
    restaurants.fields.add(new DateField({ name: 'added', required: false }))
    restaurants.fields.removeByName('syncedAt')
    restaurants.fields.add(new DateField({ name: 'syncedAt', required: false }))
    app.save(restaurants)

    const visits = app.findCollectionByNameOrId('visits')
    visits.fields.removeByName('syncedAt')
    visits.fields.add(new DateField({ name: 'syncedAt', required: false }))
    app.save(visits)
  },
  (app) => {
    const restaurants = app.findCollectionByNameOrId('restaurants')
    restaurants.fields.removeByName('added')
    restaurants.fields.add(new TextField({ name: 'added', required: false }))
    restaurants.fields.removeByName('syncedAt')
    restaurants.fields.add(new TextField({ name: 'syncedAt', required: false }))
    app.save(restaurants)

    const visits = app.findCollectionByNameOrId('visits')
    visits.fields.removeByName('syncedAt')
    visits.fields.add(new TextField({ name: 'syncedAt', required: false }))
    app.save(visits)
  },
)

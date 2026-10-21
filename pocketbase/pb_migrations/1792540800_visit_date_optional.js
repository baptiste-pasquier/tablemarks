/// <reference path="../pb_data/types.d.ts" />

// Makes `visits.date` optional: a visit may be recorded without a date. The field is changed in
// place, never removed and re-added, because a remove/add resets every row (see
// 1788048000_restaurant_visit_date_fields.js). An empty string is the stored form of "unknown";
// the client maps it to `null`.

migrate(
  (app) => {
    const visits = app.findCollectionByNameOrId('visits')
    visits.fields.getByName('date').required = false
    app.save(visits)
  },
  // Down: rows already holding '' violate `required: true`, so any later update of them fails —
  // roll back by restoring a backup, not by `migrate down`.
  (app) => {
    const visits = app.findCollectionByNameOrId('visits')
    visits.fields.getByName('date').required = true
    app.save(visits)
  },
)

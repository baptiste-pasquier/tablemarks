---
title: Demo preview
type: how-to
audience: [human, agent]
status: stable
stale_after: 2027-04-11
---

# Demo preview

![Tablemarks demo preview](../demo.gif)

The README shows a committed GIF, [`docs/demo.gif`](../demo.gif). One command regenerates it,
with no network access at all.

## Regenerate the GIF

1. Install the browser once, if it is not there yet: `npx playwright install chromium`.
2. Run `npm run test:demo`.
3. Commit `docs/demo.gif` together with the change that alters what the frames show.

The command runs `e2e/demo.spec.ts` in the Playwright `demo` project (Desktop Chrome, 1280×820,
the list and the map side by side), saves one screenshot per step in `test-results/demo-frames`,
and assembles them into `docs/demo.gif` with `scripts/generateDemoGif.mjs`. Two runs give the
same file.

## What the journey shows

Seven places are added by search and four of them get a verdict before the first frame. Then:

1. the list and the map, sorted by distance
2. the list filtered by one category
3. a pizzeria added from a pasted Google Maps link, previewed with its OpenStreetMap card
4. that pizzeria's detail — opening hours, Call and Website — with the verdict picker of
   "I'm here now"
5. the logged visit

## Change the journey

- **Frames** become GIF frames in filename order: keep the `NN-name.png` numbering. Every frame
  that redraws the whole map costs the GIF about 400 KB — the script only encodes the pixels
  that changed since the previous frame — so place a new frame where the map behind it stays
  the same, and keep 8 frames at most.
- **Places** come from `PLACES` in `e2e/osm.ts`. Keep a new place more than a kilometre from
  every other, so dedup never merges two.
- **Time** is fixed by the spec (`page.clock`), one minute per step: opening hours and dates read
  the same in every run. Leaflet fades tiles in by that clock too: after a reload, move it on, or
  the map stays blank. The list sorts by distance because same-day visits tie under the date sort.
- **The overview frames** are taken after a reload: a page that has opened and closed dialogs
  repaints unevenly, and its frames then differ by a shade between runs.
- **Tiles and font** (with its OFL licence) are served from `e2e/demo-assets/`, and only to this
  spec: every other
  journey keeps the guard's blank tile. A map that shows a tile not on disk fails the test with
  the tile's `z/x/y` path; download that tile from `https://tile.openstreetmap.org/z/x/y.png`
  once, with an identifying `User-Agent`, and commit it.

In CI the spec runs as an ordinary journey: `PLAYWRIGHT_DEMO_FRAME_DIR` is unset there, so it
asserts every step and writes no frame.

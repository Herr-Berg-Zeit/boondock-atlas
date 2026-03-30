# Boondock Atlas Live

Boondock Atlas Live is an original, GitHub Pages-ready campground and boondocking finder inspired by the layered map workflow campers loved in FreeRoam.

It is **not** a copy of FreeRoam's code, data, branding, screenshots, or proprietary assets.

## What this version does

- Loads **live campground and caravan site data** from OpenStreetMap through Overpass when the map is zoomed in.
- Displays **official public-land overlays** from BLM and USFS map services.
- Loads nearby support resources such as:
  - drinking water
  - dump stations / waste disposal
  - propane / LPG fuel stops
  - grocery stops
- Supports:
  - search and filtering
  - favorites
  - trip planning
  - Mapbox-powered route planning
  - optional vehicle dimensions (height / width / weight)
  - corridor restriction warnings from mapped OSM restriction tags
  - offline-friendly app shell caching with expiration-based local data caches
  - map popups
  - copyable coordinates
  - external directions links
- Allows you to **import your own FCC-derived coverage GeoJSON** so you can render real carrier coverage polygons.

## Why the cell layer is imported instead of bundled

Nationwide FCC mobile coverage files are large and are distributed as spatial downloads by provider / technology. For a static GitHub Pages app, the cleanest setup is:

1. download the area/provider coverage you care about
2. convert it to GeoJSON if needed
3. import it in the app or place it at `data/cell_coverage.geojson`

That keeps the repo lightweight and avoids bundling giant national coverage datasets.

## Quick start

### Run locally

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Publish to GitHub Pages

1. Create a new GitHub repository.
2. Upload all files in this folder to the repo root.
3. Open **Settings → Pages**.
4. Deploy from the `main` branch root.
5. Save.

## Files

- `index.html` – app shell
- `styles.css` – styling
- `app.js` – live data logic, map layers, filters, favorites, trip storage
- `data/campgrounds.json` – fallback sample campsites for broad zoom / offline failure
- `data/resources.json` – fallback sample resources
- `data/cell_coverage.geojson` – optional local cell coverage layer

## FCC coverage import workflow

### Option A: easiest

Replace `data/cell_coverage.geojson` with your own GeoJSON file and redeploy.

### Option B: load it in the browser

Use the **Import coverage GeoJSON** control in the sidebar.

### Example conversion with GDAL / ogr2ogr

If your FCC download is a GeoPackage:

```bash
ogr2ogr -f GeoJSON data/cell_coverage.geojson your_download.gpkg
```

If you only want a smaller clipped export, do that first in QGIS or with an `-spat` bounding box.

## Notes on live data

- Live campground and resource loading starts at zoom level **8+**.
- If live sources are unavailable or rate limited, the app falls back to the bundled sample dataset.
- OSM data quality varies by region. Some dispersed sites are richly tagged; others are sparse or missing.

## Route planning

This build uses the **Mapbox Directions API** for route planning.

### Setup

1. Create a Mapbox account.
2. Generate a **public** access token.
3. Either paste that token into the **Mapbox public token** box in the Route planner panel and click **Save token**, or put it in `config.js`.
4. If you want it preloaded in the repo, copy `config.example.js` to `config.js` and fill in the token there.

### What it can do

- route from your current location or from a selected campsite
- route to a selected campsite
- optionally include saved trip stops as intermediate waypoints
- pass vehicle dimensions for:
  - height
  - width
  - weight

### Vehicle restriction warnings

After a route is built, the app runs a corridor scan using mapped OpenStreetMap restriction tags like `maxheight`, `maxheight:physical`, `maxwidth`, and `maxweight`.

These warnings are helpful, but they are **not guaranteed complete**. Use them as a planning aid, not as a sole safety source for tall or heavy vehicles.

## Offline behavior

This repo now includes:

- a **service worker** that caches the app shell and local repo files
- expiration-based local caching for:
  - live campsite/resource query results
  - route results
  - corridor restriction warnings

### Important limitation

The app does **not** intentionally bulk-cache third-party map tiles for offline use. Public tile servers often restrict offline/prefetch use. So the site can keep working with cached data and UI assets, but full offline basemap coverage depends on what the browser already has cached.

## Good next upgrades

- provider-specific coverage toggles
- wildfire / smoke / weather overlays
- downloadable offline regions using an offline-friendly tile source
- user reviews backed by a database
- saved map presets for regions
- MVUM and closure overlays where legally and technically appropriate

## Legal note

Keep the branding original if you publish this publicly. Do not reuse the FreeRoam name, logo, screenshots, or proprietary data unless you have permission.

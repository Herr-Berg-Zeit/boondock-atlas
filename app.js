const MAP_DEFAULTS = {
  center: [39.5, -111.5],
  zoom: 5,
  liveZoomThreshold: 8
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const CACHE_TTL_MS = {
  live: 1000 * 60 * 60 * 24 * 7,
  route: 1000 * 60 * 60 * 24 * 3,
  warnings: 1000 * 60 * 60 * 24 * 3
};

const STORAGE_KEYS = {
  trip: 'boondock-atlas-live-trip',
  favorites: 'boondock-atlas-live-favorites',
  mapboxToken: 'boondock-atlas-live-mapbox-token',
  routeConfig: 'boondock-atlas-live-route-config',
  routeStart: 'boondock-atlas-live-route-start',
  routeEnd: 'boondock-atlas-live-route-end',
  syncMeta: 'boondock-atlas-live-sync-meta',
  lastRoutePreview: 'boondock-atlas-live-last-route-preview'
};

const DEFAULT_ROUTE_CONFIG = {
  includeTripWaypoints: true,
  heightFt: '',
  widthFt: '',
  weightTons: ''
};

const PRESET_MAPBOX_TOKEN = window.BOONDOCK_ATLAS_CONFIG?.mapboxToken || '';

const map = L.map('map', { zoomControl: true }).setView(MAP_DEFAULTS.center, MAP_DEFAULTS.zoom);

const baseLayers = {
  Streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }),
  Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
  }),
  Topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenTopoMap contributors'
  })
};

baseLayers.Streets.addTo(map);
L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

const liveCampsiteLayer = L.layerGroup().addTo(map);
const routeLayer = L.geoJSON(null, {
  style: {
    color: '#0f766e',
    weight: 5,
    opacity: 0.9
  }
}).addTo(map);
const clearanceWarningLayer = L.layerGroup().addTo(map);
const importedCoverageLayer = L.geoJSON(null, {
  style: (feature) => {
    const strength = Number(feature?.properties?.signal ?? feature?.properties?.bars ?? feature?.properties?.strength ?? 0);
    const palette = {
      1: '#d7e3f7',
      2: '#a9c2ec',
      3: '#76a6e7',
      4: '#2c78db'
    };

    return {
      color: palette[strength] || '#2c78db',
      fillColor: palette[strength] || '#2c78db',
      fillOpacity: 0.18,
      weight: 1
    };
  },
  onEachFeature: (feature, layer) => {
    const props = feature.properties || {};
    const provider = props.provider || props.carrier || props.name || 'Coverage polygon';
    const strength = props.signal || props.bars || props.strength || 'n/a';
    layer.bindPopup(`
      <div>
        <h3 class="popup-title">${escapeHtml(provider)}</h3>
        <p class="popup-subtitle">Imported cell coverage</p>
        <p class="popup-meta">Signal: ${escapeHtml(String(strength))}</p>
      </div>
    `);
  }
}).addTo(map);

const blmLayer = L.esri.dynamicMapLayer({
  url: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer',
  opacity: 0.35,
  position: 'front',
  useCors: true
}).addTo(map);

const usfsLayer = L.esri.dynamicMapLayer({
  url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemBoundaries_01/MapServer',
  opacity: 0.22,
  position: 'front',
  useCors: true
}).addTo(map);

const resourceLayers = {
  water: L.layerGroup().addTo(map),
  dump: L.layerGroup().addTo(map),
  propane: L.layerGroup().addTo(map),
  groceries: L.layerGroup().addTo(map)
};

const els = {
  searchInput: document.getElementById('searchInput'),
  typeFilter: document.getElementById('typeFilter'),
  priceFilter: document.getElementById('priceFilter'),
  waterFilter: document.getElementById('waterFilter'),
  roadFilter: document.getElementById('roadFilter'),
  resetBtn: document.getElementById('resetBtn'),
  locateBtn: document.getElementById('locateBtn'),
  refreshLiveBtn: document.getElementById('refreshLiveBtn'),
  clearTripBtn: document.getElementById('clearTripBtn'),
  clearFavoritesBtn: document.getElementById('clearFavoritesBtn'),
  siteList: document.getElementById('siteList'),
  resultLabel: document.getElementById('resultLabel'),
  visibleCount: document.getElementById('visibleCount'),
  freeCount: document.getElementById('freeCount'),
  liveCount: document.getElementById('liveCount'),
  tripList: document.getElementById('tripList'),
  favoritesList: document.getElementById('favoritesList'),
  selectedSitePanel: document.getElementById('selectedSitePanel'),
  selectedSourceBadge: document.getElementById('selectedSourceBadge'),
  statusLive: document.getElementById('statusLive'),
  statusBounds: document.getElementById('statusBounds'),
  statusCoverage: document.getElementById('statusCoverage'),
  statusLastSync: document.getElementById('statusLastSync'),
  statusSources: document.getElementById('statusSources'),
  mapSyncBadge: document.getElementById('mapSyncBadge'),
  coverageFileInput: document.getElementById('coverageFileInput'),
  clearCoverageBtn: document.getElementById('clearCoverageBtn'),
  layerBlm: document.getElementById('layerBlm'),
  layerUsfs: document.getElementById('layerUsfs'),
  layerLiveSites: document.getElementById('layerLiveSites'),
  layerCellCoverage: document.getElementById('layerCellCoverage'),
  layerRoute: document.getElementById('layerRoute'),
  layerClearance: document.getElementById('layerClearance'),
  layerWater: document.getElementById('layerWater'),
  layerDump: document.getElementById('layerDump'),
  layerPropane: document.getElementById('layerPropane'),
  layerGroceries: document.getElementById('layerGroceries'),
  mapboxTokenInput: document.getElementById('mapboxTokenInput'),
  saveTokenBtn: document.getElementById('saveTokenBtn'),
  clearTokenBtn: document.getElementById('clearTokenBtn'),
  routeStartLabel: document.getElementById('routeStartLabel'),
  routeEndLabel: document.getElementById('routeEndLabel'),
  useLocationStartBtn: document.getElementById('useLocationStartBtn'),
  clearRoutePointsBtn: document.getElementById('clearRoutePointsBtn'),
  includeTripWaypoints: document.getElementById('includeTripWaypoints'),
  vehicleHeightInput: document.getElementById('vehicleHeightInput'),
  vehicleWidthInput: document.getElementById('vehicleWidthInput'),
  vehicleWeightInput: document.getElementById('vehicleWeightInput'),
  buildRouteBtn: document.getElementById('buildRouteBtn'),
  clearRouteBtn: document.getElementById('clearRouteBtn'),
  routeSummary: document.getElementById('routeSummary'),
  routeWarningsList: document.getElementById('routeWarningsList'),
  routeStatusBadge: document.getElementById('routeStatusBadge')
};


const ui = {
  controlDrawer: document.getElementById('controlDrawer'),
  drawerTitle: document.getElementById('drawerTitle'),
  drawerToggleBtn: document.getElementById('drawerToggleBtn'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  siteSheet: document.getElementById('siteSheet'),
  closeSiteSheetBtn: document.getElementById('closeSiteSheetBtn'),
  paneButtons: Array.from(document.querySelectorAll('[data-open-pane]')),
  drawerTabs: Array.from(document.querySelectorAll('.drawer-tab')),
  dockButtons: Array.from(document.querySelectorAll('.dock-btn[data-open-pane]')),
  panes: Array.from(document.querySelectorAll('.drawer-pane'))
};

const siteTemplate = document.getElementById('siteCardTemplate');

const state = {
  fallbackSites: [],
  fallbackResources: [],
  liveSites: [],
  liveResources: [],
  visibleSites: [],
  siteMarkers: new Map(),
  siteIndex: new Map(),
  trip: loadStoredList(STORAGE_KEYS.trip),
  favorites: loadStoredList(STORAGE_KEYS.favorites),
  selectedSiteId: null,
  activePane: 'explore',
  drawerOpen: window.innerWidth > 1120,
  liveStatus: 'loading',
  lastFetchKey: '',
  fetchSequence: 0,
  importedCoverageName: '',
  mapboxToken: loadStoredValue(STORAGE_KEYS.mapboxToken, PRESET_MAPBOX_TOKEN),
  routeConfig: { ...DEFAULT_ROUTE_CONFIG, ...loadStoredObject(STORAGE_KEYS.routeConfig, {}) },
  routeStart: loadStoredObject(STORAGE_KEYS.routeStart, null),
  routeEnd: loadStoredObject(STORAGE_KEYS.routeEnd, null),
  routeResult: null,
  routeWarnings: [],
  syncMeta: {
    live: loadStoredObject(STORAGE_KEYS.syncMeta, {}).live || null,
    route: loadStoredObject(STORAGE_KEYS.syncMeta, {}).route || null
  },
  lastLiveSource: '',
  lastRouteSource: ''
};

initialize();

async function initialize() {
  setupDrawerUi();
  attachUiEvents();
  hydrateRouteControls();
  await loadFallbackData();
  await tryLoadRepoCoverage();
  renderSavedLists();
  updateBoundsStatus();
  renderRoutePlanner();
  updateLastSyncDisplay();
  restoreLastRoutePreview();
  registerServiceWorker();
  applyFilters();
  debouncedLiveRefresh(true)();
}


function setupDrawerUi() {
  setDrawerOpen(state.drawerOpen);
  setActivePane(state.activePane, { forceOpen: state.drawerOpen });

  ui.paneButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const pane = button.dataset.openPane;
      setActivePane(pane, { forceOpen: true });
    });
  });

  ui.drawerToggleBtn?.addEventListener('click', () => {
    setDrawerOpen(!state.drawerOpen);
  });

  ui.closeDrawerBtn?.addEventListener('click', () => setDrawerOpen(false));
  ui.closeSiteSheetBtn?.addEventListener('click', closeSiteSheet);

  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth <= 1120 && state.drawerOpen) {
      setDrawerOpen(false);
      return;
    }
    if (window.innerWidth > 1120 && !state.drawerOpen) {
      setDrawerOpen(true);
    }
  }, 120));
}

function setDrawerOpen(isOpen) {
  state.drawerOpen = isOpen;
  ui.controlDrawer?.classList.toggle('is-collapsed', !isOpen);
  ui.controlDrawer?.classList.toggle('is-open', isOpen);
  if (ui.drawerToggleBtn) {
    ui.drawerToggleBtn.textContent = isOpen ? 'Hide' : 'Show';
    ui.drawerToggleBtn.classList.toggle('is-active', isOpen);
  }
}

function setActivePane(pane, { forceOpen = false } = {}) {
  state.activePane = pane;
  const titles = {
    explore: 'Explore sites',
    layers: 'Layers and data',
    route: 'Route planning',
    saved: 'Saved places'
  };

  ui.drawerTitle && (ui.drawerTitle.textContent = titles[pane] || 'Workspace');

  ui.panes.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.pane === pane);
  });

  ui.drawerTabs.forEach((button) => {
    const active = button.dataset.openPane === pane;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  ui.dockButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.openPane === pane);
  });

  if (forceOpen) {
    setDrawerOpen(true);
  }
}

function openSiteSheet() {
  ui.siteSheet?.classList.add('is-open');
}

function closeSiteSheet() {
  ui.siteSheet?.classList.remove('is-open');
}

function attachUiEvents() {
  [els.searchInput, els.typeFilter, els.priceFilter, els.waterFilter, els.roadFilter].forEach((element) => {
    element.addEventListener('input', applyFilters);
    element.addEventListener('change', applyFilters);
  });

  els.resetBtn.addEventListener('click', resetFilters);
  els.locateBtn.addEventListener('click', locateUser);
  els.refreshLiveBtn.addEventListener('click', () => refreshLiveData(true));
  els.clearTripBtn.addEventListener('click', () => {
    state.trip = [];
    persistList(STORAGE_KEYS.trip, state.trip);
    renderSavedLists();
    renderRoutePlanner();
  });
  els.clearFavoritesBtn.addEventListener('click', () => {
    state.favorites = [];
    persistList(STORAGE_KEYS.favorites, state.favorites);
    renderSavedLists();
  });

  els.layerBlm.addEventListener('change', () => toggleLayer(blmLayer, els.layerBlm.checked));
  els.layerUsfs.addEventListener('change', () => toggleLayer(usfsLayer, els.layerUsfs.checked));
  els.layerLiveSites.addEventListener('change', () => toggleLayer(liveCampsiteLayer, els.layerLiveSites.checked));
  els.layerCellCoverage.addEventListener('change', () => toggleLayer(importedCoverageLayer, els.layerCellCoverage.checked));
  els.layerRoute.addEventListener('change', () => toggleLayer(routeLayer, els.layerRoute.checked));
  els.layerClearance.addEventListener('change', () => toggleLayer(clearanceWarningLayer, els.layerClearance.checked));
  els.layerWater.addEventListener('change', () => toggleLayer(resourceLayers.water, els.layerWater.checked));
  els.layerDump.addEventListener('change', () => toggleLayer(resourceLayers.dump, els.layerDump.checked));
  els.layerPropane.addEventListener('change', () => toggleLayer(resourceLayers.propane, els.layerPropane.checked));
  els.layerGroceries.addEventListener('change', () => toggleLayer(resourceLayers.groceries, els.layerGroceries.checked));

  els.coverageFileInput.addEventListener('change', handleCoverageFileSelect);
  els.clearCoverageBtn.addEventListener('click', clearImportedCoverage);

  els.saveTokenBtn.addEventListener('click', saveMapboxToken);
  els.clearTokenBtn.addEventListener('click', clearMapboxToken);
  els.useLocationStartBtn.addEventListener('click', setRouteStartFromLocation);
  els.clearRoutePointsBtn.addEventListener('click', clearRoutePoints);
  els.buildRouteBtn.addEventListener('click', buildRoute);
  els.clearRouteBtn.addEventListener('click', clearRoute);

  [els.includeTripWaypoints, els.vehicleHeightInput, els.vehicleWidthInput, els.vehicleWeightInput].forEach((element) => {
    element.addEventListener('change', persistRouteConfigFromUi);
    element.addEventListener('input', debounce(persistRouteConfigFromUi, 250));
  });

  const scheduleRefresh = debouncedLiveRefresh(false);
  map.on('moveend', () => {
    updateBoundsStatus();
    scheduleRefresh();
  });

  window.addEventListener('online', () => {
    renderRoutePlanner();
    updateLastSyncDisplay();
  });
  window.addEventListener('offline', () => {
    renderRoutePlanner();
    updateLastSyncDisplay();
  });
}

async function loadFallbackData() {

  const [sitesResponse, resourcesResponse] = await Promise.all([
    fetch('data/campgrounds.json').catch(() => null),
    fetch('data/resources.json').catch(() => null)
  ]);

  const rawSites = sitesResponse?.ok ? await sitesResponse.json() : [];
  const rawResources = resourcesResponse?.ok ? await resourcesResponse.json() : [];

  state.fallbackSites = rawSites.map(normalizeFallbackSite);
  state.fallbackResources = rawResources.map(normalizeFallbackResource);
  upsertSiteIndex(state.fallbackSites);
  seedResourceLayers(state.fallbackResources);
}

async function tryLoadRepoCoverage() {
  try {
    const response = await fetch('data/cell_coverage.geojson');
    if (!response.ok) return;
    const geojson = await response.json();
    if (!geojson?.features?.length) return;
    loadCoverageGeoJSON(geojson, 'Repo coverage file');
  } catch {
    // optional file, ignore failures
  }
}

function debouncedLiveRefresh(force) {
  return debounce(() => refreshLiveData(force), 650);
}

async function refreshLiveData(force = false) {
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const fetchKey = `${zoom}-${bounds.getSouth().toFixed(2)}-${bounds.getWest().toFixed(2)}-${bounds.getNorth().toFixed(2)}-${bounds.getEast().toFixed(2)}`;

  if (!force && fetchKey === state.lastFetchKey) {
    return;
  }

  if (zoom < MAP_DEFAULTS.liveZoomThreshold) {
    state.liveStatus = 'zoomed_out';
    state.liveSites = [];
    state.liveResources = [];
    state.lastFetchKey = fetchKey;
    state.lastLiveSource = '';
    seedResourceLayers(state.fallbackResources);
    applyFilters();
    renderLiveStatus();
    return;
  }

  const bbox = formatBounds(bounds);
  const requestId = ++state.fetchSequence;
  const cached = getExpiringItem(getLiveCacheKey(fetchKey));
  state.liveStatus = 'loading';
  state.lastFetchKey = fetchKey;
  renderLiveStatus();

  if (cached && !force) {
    applyLivePayload(cached.payload, 'cache', cached.savedAt);
    if (!navigator.onLine) {
      return;
    }
  }

  try {
    const [campResponse, resourceResponse] = await Promise.all([
      fetchOverpass(buildCampingQuery(bbox)),
      fetchOverpass(buildResourcesQuery(bbox))
    ]);

    if (requestId !== state.fetchSequence) return;

    const payload = {
      sites: normalizeLiveSiteCollection(campResponse?.elements || []),
      resources: normalizeLiveResourceCollection(resourceResponse?.elements || [])
    };

    setExpiringItem(getLiveCacheKey(fetchKey), payload, CACHE_TTL_MS.live);
    applyLivePayload(payload, 'network', Date.now());
  } catch (error) {
    console.error(error);
    if (requestId !== state.fetchSequence) return;

    if (cached) {
      applyLivePayload(cached.payload, 'cache', cached.savedAt);
      state.liveStatus = 'ok';
    } else {
      state.liveStatus = 'error';
      state.lastLiveSource = 'fallback';
      state.liveSites = [];
      state.liveResources = [];
      seedResourceLayers(state.fallbackResources);
      renderLiveStatus();
      applyFilters();
      updateLastSyncDisplay();
    }
  }
}

function applyLivePayload(payload, source, syncedAt) {
  state.liveSites = payload.sites || [];
  state.liveResources = payload.resources || [];
  upsertSiteIndex(state.liveSites);
  seedResourceLayers(state.liveResources);
  state.liveStatus = 'ok';
  state.lastLiveSource = source;
  renderLiveStatus();
  noteSync('live', syncedAt, source, `${state.liveSites.length} live site${state.liveSites.length === 1 ? '' : 's'}`);
  applyFilters();
}

function getLiveCacheKey(fetchKey) {
  return `boondock-atlas-live-cache-${fetchKey}`;
}

async function fetchOverpass(query) {
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: `data=${encodeURIComponent(query)}`
      });

      if (!response.ok) {
        throw new Error(`Overpass error ${response.status} from ${endpoint}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No Overpass endpoint succeeded.');
}

function buildCampingQuery(bbox) {
  return `
    [out:json][timeout:25];
    (
      nwr["tourism"="camp_site"](${bbox});
      nwr["tourism"="caravan_site"](${bbox});
      nwr["camp_site"](${bbox});
    );
    out center tags;
  `;
}

function buildResourcesQuery(bbox) {
  return `
    [out:json][timeout:25];
    (
      nwr["amenity"="drinking_water"](${bbox});
      nwr["amenity"="sanitary_dump_station"](${bbox});
      nwr["amenity"="waste_disposal"](${bbox});
      nwr["amenity"="fuel"]["fuel:lpg"="yes"](${bbox});
      nwr["shop"~"supermarket|grocery|convenience"](${bbox});
    );
    out center tags;
  `;
}

function normalizeLiveSiteCollection(elements) {
  const sites = [];
  const seen = new Set();

  elements.forEach((element) => {
    const site = normalizeOsmSite(element);
    if (!site || seen.has(site.id)) return;
    seen.add(site.id);
    sites.push(site);
  });

  return sites;
}

function normalizeLiveResourceCollection(elements) {
  const resources = [];
  const seen = new Set();

  elements.forEach((element) => {
    const resource = normalizeOsmResource(element);
    if (!resource || seen.has(resource.id)) return;
    seen.add(resource.id);
    resources.push(resource);
  });

  return resources.slice(0, 500);
}

function normalizeOsmSite(element) {
  const tags = element.tags || {};
  const lat = Number(element.center?.lat ?? element.lat);
  const lng = Number(element.center?.lon ?? element.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = classifyOsmSite(tags);
  const accessLabel = inferRoadAccess(tags);
  const isFree = isOsmFree(tags);
  const priceLabel = inferPriceLabel(tags, isFree);
  const name = tags.name || `${type} ${element.id}`;
  const website = tags.website || tags['contact:website'] || '';
  const phone = tags.phone || tags['contact:phone'] || '';
  const description = buildOsmDescription(tags, type);

  return {
    id: `osm-${element.type}-${element.id}`,
    source: 'OpenStreetMap / Overpass',
    name,
    state: tags['addr:state'] || '',
    type,
    priceLabel,
    isFree,
    water: isTruthy(tags.drinking_water),
    toilets: isTruthy(tags.toilets),
    showers: isTruthy(tags.showers),
    power: isTruthy(tags.power_supply),
    roadClass: accessLabel.className,
    roadLabel: accessLabel.label,
    lat,
    lng,
    description,
    tags: buildOsmTagList(tags, type),
    lastUpdated: 'Live OSM query',
    website,
    phone,
    reservation: readableBoolean(tags.reservation),
    operator: tags.operator || '',
    rawTags: tags,
    feeText: tags.fee || '',
    capacity: tags.capacity || '',
    sourceBadge: 'Live OSM'
  };
}

function normalizeFallbackSite(site) {
  const normalizedType =
    site.type === 'Dispersed Camping' || site.type === 'BLM Camping'
      ? 'Dispersed / Primitive'
      : site.type === 'RV Park'
        ? 'RV Park / Caravan Site'
        : 'Campground';

  return {
    id: site.id,
    source: 'Local fallback dataset',
    name: site.name,
    state: site.state,
    type: normalizedType,
    priceLabel: site.price === 0 ? 'Free' : `$${site.price}/night`,
    isFree: site.price === 0,
    water: Boolean(site.water),
    toilets: Boolean(site.water),
    showers: false,
    power: false,
    roadClass: Number(site.roadDifficulty) >= 3 ? 'rough' : 'easy',
    roadLabel: roadDifficultyLabel(site.roadDifficulty),
    lat: Number(site.lat),
    lng: Number(site.lng),
    description: site.description,
    tags: [...(site.tags || []), 'fallback demo'],
    lastUpdated: site.lastUpdated || 'n/a',
    website: '',
    phone: '',
    reservation: 'Unknown',
    operator: '',
    rawTags: {},
    feeText: site.price === 0 ? 'no' : 'yes',
    capacity: '',
    sourceBadge: 'Fallback demo site'
  };
}

function normalizeFallbackResource(item) {
  return {
    id: item.id || `fallback-${item.type}-${item.name}`,
    type: item.type,
    name: item.name,
    state: item.state || '',
    lat: Number(item.lat),
    lng: Number(item.lng),
    notes: item.notes || 'Fallback resource point',
    source: 'Local fallback dataset'
  };
}

function normalizeOsmResource(element) {
  const tags = element.tags || {};
  const lat = Number(element.center?.lat ?? element.lat);
  const lng = Number(element.center?.lon ?? element.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = classifyResourceType(tags);
  if (!type) return null;

  return {
    id: `resource-${element.type}-${element.id}`,
    type,
    name: tags.name || defaultResourceName(type),
    state: tags['addr:state'] || '',
    lat,
    lng,
    notes: buildResourceNotes(tags, type),
    source: 'OpenStreetMap / Overpass'
  };
}

function seedResourceLayers(resourceItems) {
  Object.values(resourceLayers).forEach((layer) => layer.clearLayers());

  const icons = {
    water: '💧',
    dump: '🛢️',
    propane: '🔥',
    groceries: '🛒'
  };

  resourceItems.forEach((item) => {
    const marker = L.marker([item.lat, item.lng], {
      icon: L.divIcon({
        className: 'resource-marker',
        html: `<div style="background:white;border:1px solid #d9d0c0;border-radius:999px;padding:6px 8px;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.12)">${icons[item.type] || '📍'}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })
    });

    marker.bindPopup(`
      <div>
        <h3 class="popup-title">${escapeHtml(item.name)}</h3>
        <p class="popup-subtitle">${escapeHtml(capitalize(item.type))}</p>
        <p class="popup-meta">${escapeHtml(item.notes)}</p>
        <p class="popup-meta">Source: ${escapeHtml(item.source)}</p>
      </div>
    `);

    resourceLayers[item.type]?.addLayer(marker);
  });
}

function applyFilters() {
  const search = els.searchInput.value.trim().toLowerCase();
  const selectedType = els.typeFilter.value;
  const priceFilter = els.priceFilter.value;
  const waterFilter = els.waterFilter.value;
  const roadFilter = els.roadFilter.value;

  const pool = activeSitePool();
  state.visibleSites = pool.filter((site) => {
    const haystack = [site.name, site.state, site.type, site.description, ...(site.tags || [])].join(' ').toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesType = selectedType === 'all' || site.type === selectedType || site.sourceBadge === selectedType;
    const matchesPrice =
      priceFilter === 'all' ||
      (priceFilter === 'free' && site.isFree) ||
      (priceFilter === 'paid' && !site.isFree);
    const matchesAmenity =
      waterFilter === 'all' ||
      (waterFilter === 'water' && site.water) ||
      (waterFilter === 'toilets' && site.toilets) ||
      (waterFilter === 'showers' && site.showers);
    const matchesRoad =
      roadFilter === 'all' ||
      (roadFilter === 'easy' && site.roadClass === 'easy') ||
      (roadFilter === 'rough' && site.roadClass === 'rough');

    return matchesSearch && matchesType && matchesPrice && matchesAmenity && matchesRoad;
  });

  renderSites();
  renderMapMarkers();
  renderSavedLists();
  updateStats();
}

function renderSites() {
  els.siteList.innerHTML = '';

  if (!state.visibleSites.length) {
    let message = 'No sites match the current filters.';

    if (state.liveStatus === 'zoomed_out') {
      message = 'Zoom in to level 8 or closer to load live campsite data. Demo sites are shown only at broader scales.';
    } else if (state.liveStatus === 'loading') {
      message = 'Loading live campsite data for the current map view…';
    } else if (state.liveStatus === 'ok') {
      message = 'No campsites were returned for this view and filter combination.';
    } else if (state.liveStatus === 'error') {
      message = 'Live sources did not respond. The app is falling back to local sample data.';
    }

    els.siteList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    els.resultLabel.textContent = '0 sites';
    return;
  }

  const fragment = document.createDocumentFragment();

  state.visibleSites.forEach((site) => {
    const node = siteTemplate.content.cloneNode(true);
    node.querySelector('.site-title').textContent = site.name;
    node.querySelector('.site-subtitle').textContent = `${site.state || 'Unspecified state'} · ${site.type}`;
    node.querySelector('.price-badge').textContent = site.priceLabel;
    node.querySelector('.site-description').textContent = site.description;

    const tagRow = node.querySelector('.tag-row');
    const tags = [...(site.tags || []).slice(0, 6), site.sourceBadge];
    tags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag';
      tagEl.textContent = tag;
      tagRow.appendChild(tagEl);
    });

    const meta = node.querySelector('.site-meta');
    const entries = [
      ['Source', site.sourceBadge],
      ['Access', site.roadLabel],
      ['Water', site.water ? 'Yes' : 'Unknown / no'],
      ['Updated', site.lastUpdated]
    ];

    entries.forEach(([label, value]) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      wrap.append(dt, dd);
      meta.appendChild(wrap);
    });

    node.querySelector('.focus-btn').addEventListener('click', () => focusSite(site.id));
    node.querySelector('.trip-btn').addEventListener('click', () => toggleSavedSite(site.id, 'trip'));
    node.querySelector('.favorite-btn').addEventListener('click', () => toggleSavedSite(site.id, 'favorites'));
    node.querySelector('.site-card').addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      selectSite(site.id);
    });

    fragment.appendChild(node);
  });

  els.siteList.appendChild(fragment);
  els.resultLabel.textContent = `${state.visibleSites.length} site${state.visibleSites.length === 1 ? '' : 's'}`;
}

function renderMapMarkers() {
  liveCampsiteLayer.clearLayers();
  state.siteMarkers = new Map();

  state.visibleSites.forEach((site) => {
    const marker = L.circleMarker([site.lat, site.lng], {
      radius: 8,
      fillColor: site.sourceBadge === 'Live OSM' ? '#24543a' : '#d97706',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.95
    });

    marker.bindPopup(buildSitePopup(site));
    marker.on('click', () => selectSite(site.id));
    marker.addTo(liveCampsiteLayer);
    state.siteMarkers.set(site.id, marker);
  });
}

function buildSitePopup(site) {
  const websiteLink = site.website
    ? `<div class="detail-links"><a href="${escapeAttribute(site.website)}" target="_blank" rel="noopener noreferrer">Website</a></div>`
    : '';

  return `
    <div>
      <h3 class="popup-title">${escapeHtml(site.name)}</h3>
      <p class="popup-subtitle">${escapeHtml(site.type)} · ${escapeHtml(site.priceLabel)}</p>
      <p class="popup-meta">${escapeHtml(site.description)}</p>
      <p class="popup-meta">Access: ${escapeHtml(site.roadLabel)} · Water: ${site.water ? 'Yes' : 'Unknown / no'} · Toilets: ${site.toilets ? 'Yes' : 'Unknown / no'}</p>
      <div class="popup-actions">
        <button class="primary-btn" onclick="window.boondockAtlas.focusSite('${escapeAttribute(site.id)}')">Inspect</button>
        <button class="secondary-btn" onclick="window.boondockAtlas.toggleSavedSite('${escapeAttribute(site.id)}', 'trip')">Add to trip</button>
      </div>
      ${websiteLink}
    </div>
  `;
}

function selectSite(siteId) {
  state.selectedSiteId = siteId;
  const site = state.siteIndex.get(siteId);

  if (!site) {
    els.selectedSitePanel.className = 'detail-panel empty-state';
    els.selectedSitePanel.textContent = 'That site is no longer in memory for the current session.';
    els.selectedSourceBadge.textContent = 'Unavailable';
    openSiteSheet();
    return;
  }

  els.selectedSourceBadge.textContent = site.sourceBadge;
  els.selectedSitePanel.className = 'detail-panel';
  els.selectedSitePanel.innerHTML = `
    <h3 class="detail-title">${escapeHtml(site.name)}</h3>
    <p>${escapeHtml(site.description)}</p>
    <div class="detail-grid">
      <div><dt>Type</dt><dd>${escapeHtml(site.type)}</dd></div>
      <div><dt>Price</dt><dd>${escapeHtml(site.priceLabel)}</dd></div>
      <div><dt>Water</dt><dd>${site.water ? 'Yes' : 'Unknown / no'}</dd></div>
      <div><dt>Toilets</dt><dd>${site.toilets ? 'Yes' : 'Unknown / no'}</dd></div>
      <div><dt>Showers</dt><dd>${site.showers ? 'Yes' : 'Unknown / no'}</dd></div>
      <div><dt>Access</dt><dd>${escapeHtml(site.roadLabel)}</dd></div>
      <div><dt>Reservations</dt><dd>${escapeHtml(site.reservation)}</dd></div>
      <div><dt>Coordinates</dt><dd>${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(site.source)}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(site.lastUpdated)}</dd></div>
    </div>
    <div class="tag-row">
      ${(site.tags || []).slice(0, 10).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
    </div>
    <div class="detail-actions">
      <button class="primary-btn" onclick="window.boondockAtlas.focusSite('${escapeAttribute(site.id)}')">Show on map</button>
      <button class="secondary-btn" onclick="window.boondockAtlas.toggleSavedSite('${escapeAttribute(site.id)}', 'trip')">Add to trip</button>
      <button class="secondary-btn" onclick="window.boondockAtlas.toggleSavedSite('${escapeAttribute(site.id)}', 'favorites')">Favorite</button>
      <button class="secondary-btn" onclick="window.boondockAtlas.copyCoords(${site.lat}, ${site.lng})">Copy coords</button>
      <button class="secondary-btn" onclick="window.boondockAtlas.setRoutePointFromSite('${escapeAttribute(site.id)}', 'start')">Set as start</button>
      <button class="secondary-btn" onclick="window.boondockAtlas.setRoutePointFromSite('${escapeAttribute(site.id)}', 'end')">Set as destination</button>
    </div>
    <div class="detail-links">
      <a href="https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}" target="_blank" rel="noopener noreferrer">Directions</a>
      <a href="https://www.openstreetmap.org/?mlat=${site.lat}&mlon=${site.lng}#map=14/${site.lat}/${site.lng}" target="_blank" rel="noopener noreferrer">OSM view</a>
      ${site.website ? `<a href="${escapeAttribute(site.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
      ${site.phone ? `<a href="tel:${escapeAttribute(site.phone)}">Call</a>` : ''}
    </div>
  `;

  openSiteSheet();
}


function updateStats() {
  els.visibleCount.textContent = state.visibleSites.length;
  els.freeCount.textContent = state.visibleSites.filter((site) => site.isFree).length;
  els.liveCount.textContent = state.liveSites.length;
}

function focusSite(siteId) {
  const site = state.siteIndex.get(siteId);
  const marker = state.siteMarkers.get(siteId);
  if (!site) return;

  map.flyTo([site.lat, site.lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
  if (marker) marker.openPopup();
  selectSite(siteId);
}

function toggleSavedSite(siteId, bucket) {
  const exists = (bucket === 'trip' ? state.trip : state.favorites).includes(siteId);
  const next = exists
    ? (bucket === 'trip' ? state.trip : state.favorites).filter((id) => id !== siteId)
    : [...(bucket === 'trip' ? state.trip : state.favorites), siteId];

  if (bucket === 'trip') {
    state.trip = next;
    persistList(STORAGE_KEYS.trip, next);
  } else {
    state.favorites = next;
    persistList(STORAGE_KEYS.favorites, next);
  }

  renderSavedLists();
}

function renderSavedLists() {
  renderSavedBucket(els.tripList, state.trip, 'trip');
  renderSavedBucket(els.favoritesList, state.favorites, 'favorites');
  renderRoutePlanner();
}

function renderSavedBucket(element, ids, bucket) {
  element.innerHTML = '';

  if (!ids.length) {
    element.innerHTML = `<li class="empty-state">No ${bucket === 'trip' ? 'trip stops' : 'favorites'} yet.</li>`;
    return;
  }

  ids
    .map((id) => state.siteIndex.get(id))
    .filter(Boolean)
    .forEach((site) => {
      const item = document.createElement('li');
      item.className = 'saved-item';
      item.innerHTML = `
        <strong>${escapeHtml(site.name)}</strong>
        <p>${escapeHtml(site.type)} · ${escapeHtml(site.priceLabel)} · ${escapeHtml(site.sourceBadge)}</p>
      `;

      const actions = document.createElement('div');
      actions.className = 'saved-actions';

      const showBtn = document.createElement('button');
      showBtn.className = 'secondary-btn';
      showBtn.textContent = 'Show';
      showBtn.addEventListener('click', () => focusSite(site.id));

      const removeBtn = document.createElement('button');
      removeBtn.className = 'secondary-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => toggleSavedSite(site.id, bucket));

      actions.append(showBtn, removeBtn);
      item.appendChild(actions);
      element.appendChild(item);
    });
}

function resetFilters() {
  els.searchInput.value = '';
  els.typeFilter.value = 'all';
  els.priceFilter.value = 'all';
  els.waterFilter.value = 'all';
  els.roadFilter.value = 'all';
  map.flyTo(MAP_DEFAULTS.center, MAP_DEFAULTS.zoom, { duration: 0.8 });
  state.selectedSiteId = null;
  els.selectedSitePanel.className = 'detail-panel empty-state';
  els.selectedSitePanel.textContent = 'Click a site card or map marker to inspect details, links, and trip actions.';
  els.selectedSourceBadge.textContent = 'Nothing selected';
  closeSiteSheet();
  applyFilters();
}

function locateUser() {
  if (!navigator.geolocation) {
    alert('Geolocation is not available in this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      map.flyTo([coords.latitude, coords.longitude], 10, { duration: 0.8 });
      L.circleMarker([coords.latitude, coords.longitude], {
        radius: 8,
        fillColor: '#111827',
        color: '#fff',
        weight: 2,
        fillOpacity: 1
      })
        .addTo(map)
        .bindPopup('You are here')
        .openPopup();
    },
    () => {
      alert('Could not access your location.');
    }
  );
}

function handleCoverageFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const geojson = JSON.parse(reader.result);
      loadCoverageGeoJSON(geojson, file.name);
    } catch {
      alert('That file does not appear to be valid GeoJSON.');
    }
  };
  reader.readAsText(file);
}

function loadCoverageGeoJSON(geojson, label) {
  importedCoverageLayer.clearLayers();
  importedCoverageLayer.addData(geojson);
  state.importedCoverageName = label;
  els.statusCoverage.textContent = `${geojson.features?.length || 0} features`;
  els.statusSources.textContent = 'OSM + official maps + imported coverage';

  if (els.layerCellCoverage.checked) {
    importedCoverageLayer.addTo(map);
  }
}

function clearImportedCoverage() {
  importedCoverageLayer.clearLayers();
  state.importedCoverageName = '';
  els.statusCoverage.textContent = 'No import';
  els.statusSources.textContent = 'OSM + official maps';
  els.coverageFileInput.value = '';
}

function updateBoundsStatus() {
  const bounds = map.getBounds();
  els.statusBounds.textContent = `${bounds.getSouth().toFixed(2)}, ${bounds.getWest().toFixed(2)} → ${bounds.getNorth().toFixed(2)}, ${bounds.getEast().toFixed(2)}`;
}

function renderLiveStatus() {
  if (state.liveStatus === 'zoomed_out') {
    els.statusLive.textContent = 'Zoom in for live sites';
    return;
  }

  if (state.liveStatus === 'loading') {
    els.statusLive.textContent = state.lastLiveSource === 'cache' ? 'Showing cached live data' : 'Loading live OSM data';
    return;
  }

  if (state.liveStatus === 'ok') {
    const prefix = state.lastLiveSource === 'cache' ? 'Cached' : 'Live';
    els.statusLive.textContent = `${prefix} ${state.liveSites.length} sites`;
    return;
  }

  if (state.liveStatus === 'error') {
    els.statusLive.textContent = 'Live fetch failed';
    return;
  }

  els.statusLive.textContent = 'Starting…';
}

function activeSitePool() {
  if (state.liveStatus === 'ok') return state.liveSites;
  if (state.liveStatus === 'zoomed_out' || state.liveStatus === 'error' || state.liveStatus === 'loading') return state.fallbackSites;
  return state.fallbackSites;
}

function toggleLayer(layer, shouldShow) {
  if (shouldShow) {
    layer.addTo(map);
  } else {
    map.removeLayer(layer);
  }
}

function upsertSiteIndex(sites) {
  sites.forEach((site) => state.siteIndex.set(site.id, site));
}

function classifyOsmSite(tags) {
  const tourism = tags.tourism || '';
  const campSiteDetail = (tags.camp_site || '').toLowerCase();
  const backcountry = campSiteDetail.includes('backcountry') || campSiteDetail.includes('basic') || tags.backcountry === 'yes';

  if (tourism === 'caravan_site') return 'RV Park / Caravan Site';
  if (backcountry || tags.access === 'permissive' || tags.fee === 'no') return 'Dispersed / Primitive';
  return 'Campground';
}

function inferRoadAccess(tags) {
  const detail = [tags.surface, tags.tracktype, tags.smoothness, tags.highway].filter(Boolean).join(' ').toLowerCase();

  if (/rocky|bad|very_bad|horrible|track/.test(detail)) {
    return { className: 'rough', label: 'Likely rough / primitive' };
  }

  return { className: 'easy', label: 'Unknown to moderate access' };
}

function isOsmFree(tags) {
  if ((tags.fee || '').toLowerCase() === 'no') return true;
  if ((tags.charge || '').trim() === '0') return true;
  return false;
}

function inferPriceLabel(tags, isFree) {
  if (isFree) return 'Free';
  if (tags.charge) return tags.charge;
  if ((tags.fee || '').toLowerCase() === 'yes') return 'Fee required';
  return 'Unknown price';
}

function buildOsmDescription(tags, type) {
  const parts = [];
  if (tags.operator) parts.push(`Operated by ${tags.operator}`);
  if (tags.description) parts.push(tags.description);
  if (tags.sanitary_dump_station === 'yes') parts.push('Sanitary dump station noted');
  if (tags.internet_access) parts.push(`Internet access: ${tags.internet_access}`);
  if (!parts.length) parts.push(`${type} returned from live OpenStreetMap data for this map view.`);
  return parts.join(' ');
}

function buildOsmTagList(tags, type) {
  const items = [type];
  if (tags.fee === 'no') items.push('free');
  if (tags.drinking_water === 'yes') items.push('water');
  if (tags.toilets === 'yes') items.push('toilets');
  if (tags.showers === 'yes') items.push('showers');
  if (tags.power_supply === 'yes') items.push('power');
  if (tags.reservation) items.push(`reservation:${tags.reservation}`);
  if (tags.access) items.push(`access:${tags.access}`);
  if (tags.operator) items.push(tags.operator);
  return items.slice(0, 8);
}

function classifyResourceType(tags) {
  if (tags.amenity === 'drinking_water') return 'water';
  if (tags.amenity === 'sanitary_dump_station' || tags.amenity === 'waste_disposal') return 'dump';
  if (tags.amenity === 'fuel' && tags['fuel:lpg'] === 'yes') return 'propane';
  if (/supermarket|grocery|convenience/.test(tags.shop || '')) return 'groceries';
  return '';
}

function defaultResourceName(type) {
  const names = {
    water: 'Water source',
    dump: 'Dump station',
    propane: 'Propane stop',
    groceries: 'Grocery stop'
  };
  return names[type] || 'Resource';
}

function buildResourceNotes(tags, type) {
  const notes = [];
  if (tags.operator) notes.push(tags.operator);
  if (tags.opening_hours) notes.push(`Hours: ${tags.opening_hours}`);
  if (type === 'propane' && tags.brand) notes.push(tags.brand);
  if (!notes.length) notes.push('Returned from live OpenStreetMap data.');
  return notes.join(' · ');
}

function formatBounds(bounds) {
  return [
    bounds.getSouth().toFixed(5),
    bounds.getWest().toFixed(5),
    bounds.getNorth().toFixed(5),
    bounds.getEast().toFixed(5)
  ].join(',');
}

function readableBoolean(value) {
  if (!value) return 'Unknown';
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  return value;
}

function isTruthy(value) {
  return ['yes', 'true', '1', 'designated'].includes(String(value).toLowerCase());
}

function roadDifficultyLabel(value) {
  const labels = {
    1: 'Paved / easy',
    2: 'Graded dirt',
    3: 'Washboard / ruts',
    4: 'Rough / 4x4-advised'
  };

  return labels[value] || 'Unknown';
}


function hydrateRouteControls() {
  els.mapboxTokenInput.value = state.mapboxToken || '';
  els.includeTripWaypoints.checked = Boolean(state.routeConfig.includeTripWaypoints);
  els.vehicleHeightInput.value = state.routeConfig.heightFt ?? '';
  els.vehicleWidthInput.value = state.routeConfig.widthFt ?? '';
  els.vehicleWeightInput.value = state.routeConfig.weightTons ?? '';
}

function persistRouteConfigFromUi() {
  state.routeConfig = {
    includeTripWaypoints: Boolean(els.includeTripWaypoints.checked),
    heightFt: els.vehicleHeightInput.value,
    widthFt: els.vehicleWidthInput.value,
    weightTons: els.vehicleWeightInput.value
  };
  persistValue(STORAGE_KEYS.routeConfig, state.routeConfig);
  renderRoutePlanner();
}

function saveMapboxToken() {
  state.mapboxToken = els.mapboxTokenInput.value.trim();
  if (state.mapboxToken) {
    localStorage.setItem(STORAGE_KEYS.mapboxToken, state.mapboxToken);
  }
  renderRoutePlanner();
}

function clearMapboxToken() {
  state.mapboxToken = '';
  els.mapboxTokenInput.value = '';
  localStorage.removeItem(STORAGE_KEYS.mapboxToken);
  renderRoutePlanner();
}

function formatRoutePointLabel(point) {
  if (!point) return 'Not set';
  const parts = [point.label || 'Pinned point'];
  if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    parts.push(`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
  }
  return parts.join(' · ');
}

function renderRoutePlanner() {
  els.routeStartLabel.textContent = formatRoutePointLabel(state.routeStart);
  els.routeEndLabel.textContent = formatRoutePointLabel(state.routeEnd);

  const hasToken = Boolean(state.mapboxToken);
  const status = state.routeResult ? (state.lastRouteSource === 'cache' ? 'Cached route' : 'Route ready') : 'No route';
  els.routeStatusBadge.textContent = status;

  if (!state.routeResult) {
    els.routeWarningsList.innerHTML = '<li class="empty-state">Clearance scans appear here after a route is built.</li>';
    if (!hasToken) {
      els.routeSummary.innerHTML = 'No route yet. Save a Mapbox public token, then set a start and destination.';
    }
  }
}

function setRoutePoint(kind, point) {
  if (kind === 'start') {
    state.routeStart = point;
    persistValue(STORAGE_KEYS.routeStart, point);
  } else {
    state.routeEnd = point;
    persistValue(STORAGE_KEYS.routeEnd, point);
  }
  renderRoutePlanner();
}

function setRoutePointFromSite(siteId, kind) {
  const site = state.siteIndex.get(siteId);
  if (!site) return;
  setRoutePoint(kind, {
    source: 'site',
    siteId: site.id,
    label: site.name,
    lat: site.lat,
    lng: site.lng
  });
}

function clearRoutePoints() {
  state.routeStart = null;
  state.routeEnd = null;
  localStorage.removeItem(STORAGE_KEYS.routeStart);
  localStorage.removeItem(STORAGE_KEYS.routeEnd);
  state.routeResult = null;
  state.routeWarnings = [];
  state.lastRouteSource = '';
  routeLayer.clearLayers();
  clearanceWarningLayer.clearLayers();
  localStorage.removeItem(STORAGE_KEYS.lastRoutePreview);
  els.routeSummary.innerHTML = 'Route points cleared. Pick a new start and destination.';
  renderRoutePlanner();
}

function clearRoute() {
  state.routeResult = null;
  state.routeWarnings = [];
  state.lastRouteSource = '';
  routeLayer.clearLayers();
  clearanceWarningLayer.clearLayers();
  localStorage.removeItem(STORAGE_KEYS.lastRoutePreview);
  els.routeSummary.innerHTML = 'Route cleared. Set a start and destination to build another one.';
  renderRoutePlanner();
}

function setRouteStartFromLocation() {
  if (!navigator.geolocation) {
    els.routeSummary.innerHTML = 'Geolocation is not available in this browser.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setRoutePoint('start', {
        source: 'location',
        label: 'Current location',
        lat: coords.latitude,
        lng: coords.longitude
      });
      map.flyTo([coords.latitude, coords.longitude], Math.max(map.getZoom(), 10), { duration: 0.8 });
    },
    () => {
      els.routeSummary.innerHTML = 'Could not access your location for route planning.';
    }
  );
}

async function buildRoute() {
  persistRouteConfigFromUi();
  const token = (state.mapboxToken || '').trim();

  if (!token) {
    els.routeSummary.innerHTML = 'Add a Mapbox public token before building a route.';
    return;
  }

  if (!state.routeStart || !state.routeEnd) {
    els.routeSummary.innerHTML = 'Set both a route start and destination first.';
    return;
  }

  const vehicle = getVehicleDimensionsFromUi();
  const points = [state.routeStart, ...buildWaypointsFromTrip(), state.routeEnd];
  const routeKey = createRouteCacheKey(points, vehicle);
  const cached = getExpiringItem(routeKey);

  if (!navigator.onLine && cached) {
    await applyRoutePayload(cached.payload, 'cache', cached.savedAt, routeKey, vehicle);
    return;
  }

  if (!navigator.onLine && !cached) {
    els.routeSummary.innerHTML = 'You are offline and there is no cached route for this exact trip yet.';
    return;
  }

  els.routeSummary.innerHTML = 'Building route…';

  try {
    const url = buildMapboxRouteUrl(points, vehicle, token);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox route error ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes?.length) {
      throw new Error('No route was returned for those points and vehicle limits.');
    }

    const payload = {
      route: data.routes[0],
      points,
      vehicle,
      waypoints: data.waypoints || []
    };

    setExpiringItem(routeKey, payload, CACHE_TTL_MS.route);
    await applyRoutePayload(payload, 'network', Date.now(), routeKey, vehicle);
  } catch (error) {
    console.error(error);
    if (cached) {
      await applyRoutePayload(cached.payload, 'cache', cached.savedAt, routeKey, vehicle);
      return;
    }

    els.routeSummary.innerHTML = `Route build failed: ${escapeHtml(error.message)}`;
    routeLayer.clearLayers();
    clearanceWarningLayer.clearLayers();
    state.routeResult = null;
    state.routeWarnings = [];
    renderRoutePlanner();
  }
}

async function applyRoutePayload(payload, source, syncedAt, routeKey, vehicle) {
  state.routeResult = payload;
  state.lastRouteSource = source;
  routeLayer.clearLayers();
  routeLayer.addData({
    type: 'Feature',
    geometry: payload.route.geometry,
    properties: {
      source,
      distance: payload.route.distance,
      duration: payload.route.duration
    }
  });

  if (els.layerRoute.checked) {
    routeLayer.addTo(map);
  }

  try {
    const routeBounds = routeLayer.getBounds();
    if (routeBounds.isValid()) {
      map.fitBounds(routeBounds.pad(0.12));
    }
  } catch {
    // ignore fit failures
  }

  state.routeWarnings = await fetchRouteClearanceWarnings(routeKey, payload.route.geometry, vehicle);
  renderRouteResult(payload.route, payload.points, vehicle, source, syncedAt);
  renderRouteWarnings();
  noteSync('route', syncedAt, source, 'Route and warnings');
  setExpiringItem(STORAGE_KEYS.lastRoutePreview, { payload, warnings: state.routeWarnings, source }, CACHE_TTL_MS.route);
}

function restoreLastRoutePreview() {
  const cached = getExpiringItem(STORAGE_KEYS.lastRoutePreview);
  if (!cached?.payload?.payload?.route) {
    return;
  }

  state.routeResult = cached.payload.payload;
  state.routeWarnings = cached.payload.warnings || [];
  state.lastRouteSource = cached.payload.source || 'cache';
  routeLayer.clearLayers();
  routeLayer.addData({ type: 'Feature', geometry: state.routeResult.route.geometry, properties: {} });
  if (els.layerRoute.checked) routeLayer.addTo(map);
  renderRouteResult(state.routeResult.route, state.routeResult.points, state.routeResult.vehicle, state.lastRouteSource, cached.savedAt);
  renderRouteWarnings();
}

function buildWaypointsFromTrip() {
  if (!state.routeConfig.includeTripWaypoints) return [];

  return state.trip
    .map((id) => state.siteIndex.get(id))
    .filter(Boolean)
    .filter((site) => {
      const sameAsStart = state.routeStart && nearlyEqual(site.lat, state.routeStart.lat) && nearlyEqual(site.lng, state.routeStart.lng);
      const sameAsEnd = state.routeEnd && nearlyEqual(site.lat, state.routeEnd.lat) && nearlyEqual(site.lng, state.routeEnd.lng);
      return !sameAsStart && !sameAsEnd;
    })
    .slice(0, 23)
    .map((site) => ({
      source: 'trip',
      label: site.name,
      siteId: site.id,
      lat: site.lat,
      lng: site.lng
    }));
}

function buildMapboxRouteUrl(points, vehicle, token) {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const params = new URLSearchParams({
    access_token: token,
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    alternatives: 'false',
    notifications: 'all'
  });

  if (vehicle.heightMeters != null) params.set('max_height', vehicle.heightMeters.toFixed(2));
  if (vehicle.widthMeters != null) params.set('max_width', vehicle.widthMeters.toFixed(2));
  if (vehicle.weightTons != null) params.set('max_weight', vehicle.weightTons.toFixed(2));

  return `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?${params.toString()}`;
}

function createRouteCacheKey(points, vehicle) {
  const dims = [vehicle.heightMeters, vehicle.widthMeters, vehicle.weightTons].map((value) => value ?? '').join('|');
  const coords = points.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(';');
  return `boondock-atlas-route-${coords}-${dims}`;
}

async function fetchRouteClearanceWarnings(routeKey, geometry, vehicle) {
  clearanceWarningLayer.clearLayers();

  if (vehicle.heightMeters == null && vehicle.widthMeters == null && vehicle.weightTons == null) {
    return [];
  }

  const warningCacheKey = `${routeKey}-warnings`;
  const cached = getExpiringItem(warningCacheKey);
  if (!navigator.onLine && cached) {
    renderClearanceMarkers(cached.payload);
    return cached.payload;
  }

  const bounds = getGeometryBounds(geometry);
  if (!bounds) {
    return [];
  }

  try {
    const raw = await fetchOverpass(buildClearanceWarningsQuery(bounds));
    const warnings = normalizeRouteWarnings(raw?.elements || [], vehicle);
    setExpiringItem(warningCacheKey, warnings, CACHE_TTL_MS.warnings);
    renderClearanceMarkers(warnings);
    return warnings;
  } catch (error) {
    console.error(error);
    if (cached) {
      renderClearanceMarkers(cached.payload);
      return cached.payload;
    }
    return [];
  }
}

function buildClearanceWarningsQuery(bounds) {
  const bbox = [
    bounds.getSouth().toFixed(5),
    bounds.getWest().toFixed(5),
    bounds.getNorth().toFixed(5),
    bounds.getEast().toFixed(5)
  ].join(',');

  return `
    [out:json][timeout:25];
    (
      nwr["maxheight"](${bbox});
      nwr["maxheight:physical"](${bbox});
      nwr["maxwidth"](${bbox});
      nwr["maxweight"](${bbox});
    );
    out center tags;
  `;
}

function normalizeRouteWarnings(elements, vehicle) {
  return elements
    .map((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const tags = element.tags || {};
      const heightLimit = parseDimensionValue(tags['maxheight:physical'] || tags.maxheight, 'height');
      const widthLimit = parseDimensionValue(tags.maxwidth, 'width');
      const weightLimit = parseDimensionValue(tags.maxweight, 'weight');
      const conflicts = [];

      if (vehicle.heightMeters != null && heightLimit != null && heightLimit < vehicle.heightMeters) {
        conflicts.push(`height limit ${formatMeters(heightLimit)}`);
      }
      if (vehicle.widthMeters != null && widthLimit != null && widthLimit < vehicle.widthMeters) {
        conflicts.push(`width limit ${formatMeters(widthLimit)}`);
      }
      if (vehicle.weightTons != null && weightLimit != null && weightLimit < vehicle.weightTons) {
        conflicts.push(`weight limit ${weightLimit.toFixed(1)} tons`);
      }

      if (!conflicts.length) return null;

      return {
        id: `${element.type}-${element.id}`,
        lat,
        lng,
        name: tags.name || 'Restriction in route corridor',
        description: conflicts.join(' · '),
        source: 'OpenStreetMap restriction tags'
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}

function renderClearanceMarkers(warnings) {
  clearanceWarningLayer.clearLayers();

  warnings.forEach((warning) => {
    const marker = L.marker([warning.lat, warning.lng], {
      icon: L.divIcon({
        className: 'warning-marker',
        html: '<div>⚠️</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    });

    marker.bindPopup(`
      <div>
        <h3 class="popup-title">${escapeHtml(warning.name)}</h3>
        <p class="popup-subtitle">Potential vehicle restriction</p>
        <p class="popup-meta">${escapeHtml(warning.description)}</p>
        <p class="popup-meta">Source: ${escapeHtml(warning.source)}</p>
      </div>
    `);

    clearanceWarningLayer.addLayer(marker);
  });

  if (els.layerClearance.checked) {
    clearanceWarningLayer.addTo(map);
  }
}

function renderRouteResult(route, points, vehicle, source, syncedAt) {
  const distanceMiles = (route.distance / 1609.344).toFixed(1);
  const durationHours = formatDuration(route.duration);
  const dimBits = [];
  if (vehicle.heightMeters != null) dimBits.push(`height ${Number(state.routeConfig.heightFt).toFixed(1)} ft`);
  if (vehicle.widthMeters != null) dimBits.push(`width ${Number(state.routeConfig.widthFt).toFixed(1)} ft`);
  if (vehicle.weightTons != null) dimBits.push(`weight ${vehicle.weightTons.toFixed(1)} tons`);

  els.routeSummary.innerHTML = `
    <strong>${escapeHtml(points[0].label || 'Start')} → ${escapeHtml(points[points.length - 1].label || 'Destination')}</strong>
    <p>${distanceMiles} miles · ${durationHours}</p>
    <p>${dimBits.length ? `Vehicle filters: ${escapeHtml(dimBits.join(' · '))}` : 'No custom vehicle filters entered.'}</p>
    <p>Source: ${escapeHtml(source === 'cache' ? 'cached route' : 'live Mapbox route')} · Synced ${escapeHtml(formatTimestamp(syncedAt))}</p>
    <p class="helper-text">Trip stops are included as intermediate waypoints only when that checkbox is enabled. Clearance warnings are corridor scans based on mapped restriction tags and may be incomplete.</p>
  `;
}

function renderRouteWarnings() {
  els.routeWarningsList.innerHTML = '';

  if (!state.routeWarnings.length) {
    els.routeWarningsList.innerHTML = '<li class="empty-state">No corridor restriction warnings were found for the current vehicle dimensions.</li>';
    return;
  }

  state.routeWarnings.forEach((warning) => {
    const item = document.createElement('li');
    item.className = 'saved-item';
    item.innerHTML = `
      <strong>${escapeHtml(warning.name)}</strong>
      <p>${escapeHtml(warning.description)}</p>
    `;

    const actions = document.createElement('div');
    actions.className = 'saved-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'secondary-btn';
    zoomBtn.textContent = 'Show';
    zoomBtn.addEventListener('click', () => map.flyTo([warning.lat, warning.lng], Math.max(map.getZoom(), 12), { duration: 0.8 }));

    actions.appendChild(zoomBtn);
    item.appendChild(actions);
    els.routeWarningsList.appendChild(item);
  });
}

function getVehicleDimensionsFromUi() {
  const heightFt = parseOptionalNumber(state.routeConfig.heightFt);
  const widthFt = parseOptionalNumber(state.routeConfig.widthFt);
  const weightTons = parseOptionalNumber(state.routeConfig.weightTons);
  return {
    heightMeters: heightFt != null ? heightFt * 0.3048 : null,
    widthMeters: widthFt != null ? widthFt * 0.3048 : null,
    weightTons: weightTons != null ? weightTons : null
  };
}

function parseDimensionValue(value, kind) {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  if (kind === 'weight') {
    const num = parseFloat(raw.replace(/[^\d.\-]/g, ''));
    if (!Number.isFinite(num)) return null;
    if (/(lb|lbs|pound)/.test(raw)) return num / 2000;
    if (/(kg)/.test(raw)) return num / 1000;
    return num;
  }

  const footInchMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:ft|')\s*(\d+(?:\.\d+)?)?\s*(?:in|")?/);
  if (footInchMatch) {
    const feet = Number(footInchMatch[1] || 0);
    const inches = Number(footInchMatch[2] || 0);
    return (feet + inches / 12) * 0.3048;
  }

  const num = parseFloat(raw.replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(num)) return null;
  if (/(ft|')/.test(raw)) return num * 0.3048;
  if (/(cm)/.test(raw)) return num / 100;
  return num;
}

function parseOptionalNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMeters(value) {
  return `${(value / 0.3048).toFixed(1)} ft`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function getGeometryBounds(geometry) {
  if (!geometry?.coordinates?.length) return null;
  const latLngs = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return L.latLngBounds(latLngs);
}

function nearlyEqual(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.00001;
}

function noteSync(kind, at, source, label) {
  state.syncMeta[kind] = { at, source, label };
  persistValue(STORAGE_KEYS.syncMeta, state.syncMeta);
  updateLastSyncDisplay();
}

function updateLastSyncDisplay() {
  const entries = [state.syncMeta.live, state.syncMeta.route].filter(Boolean).sort((a, b) => b.at - a.at);
  if (!entries.length) {
    els.statusLastSync.textContent = 'Not synced yet';
    els.mapSyncBadge.textContent = 'Last sync: waiting';
    return;
  }

  const latest = entries[0];
  const relative = summarizeRelativeTime(latest.at);
  const mode = latest.source === 'cache' ? 'cached' : 'live';
  const offlineBit = navigator.onLine ? '' : ' · offline';
  els.statusLastSync.textContent = `${mode} ${relative}`;
  els.mapSyncBadge.textContent = `Last sync: ${latest.label || 'data'} · ${mode} ${relative}${offlineBit}`;
}

function summarizeRelativeTime(timestamp) {
  const deltaMs = Math.max(0, Date.now() - Number(timestamp || 0));
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'unknown';
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  navigator.serviceWorker.register('service-worker.js').catch((error) => console.error('Service worker registration failed', error));
}

function loadStoredObject(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredValue(key, fallback = '') {
  const value = localStorage.getItem(key);
  return value == null ? fallback : value;
}

function persistValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setExpiringItem(key, payload, ttlMs) {
  localStorage.setItem(key, JSON.stringify({ payload, savedAt: Date.now(), expiresAt: Date.now() + ttlMs }));
}

function getExpiringItem(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadStoredList(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function persistList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function debounce(fn, delay) {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

function copyCoords(lat, lng) {
  const text = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  navigator.clipboard?.writeText(text);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

window.boondockAtlas = {
  focusSite,
  toggleSavedSite,
  copyCoords,
  setRoutePointFromSite,
  clearRoute,
  buildRoute,
  closeSiteSheet
};

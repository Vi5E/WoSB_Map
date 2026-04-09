const COLLAPSE_STATE_KEY = 'wosb-collapse-state';
function loadCollapseState() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSE_STATE_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch (_) {}
  return {};
}
function saveCollapseState(state) {
  try { localStorage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(state)); } catch (_) {}
}

/* ============================================
   World of Sea Battle - Interactive Map v2
   Leaflet.js + Modern UI (app.js)
   ============================================ */

// =============================================================================
// CONSTANTS
// =============================================================================
const ASSETS_PATH = 'assets/';
const PROGRESSIVE_OVERLAY_SOURCES = {
  baseMap: { low: 'mapa.png', high: 'mapa_high.png' },
  circle: { low: 'circle.png', high: 'circle_high.png' },
  fastTravel: { low: 'fast-travel.png', high: 'fast-travel_high.png' }
};
const MAX_ZOOM = 4;
const MIN_ZOOM = -1;
const DEFAULT_ZOOM = 1;
const PRODUCTION_TYPES = ['coal', 'copper', 'farm', 'iron', 'resin', 'rum', 'water', 'wood', 'printshop'];
const MEASURE_LABEL_ICON_SIZE = [84, 24];
const MEASURE_SNAP_DISTANCE_PX = 18;
const DISTANCE_ROUTES_STORAGE_KEY = 'wosb-distance-routes';
const DISTANCE_ROUTES_VISIBLE_STORAGE_KEY = 'wosb-distance-routes-visible';
const ROUTE_ANIMATION_STORAGE_KEY = 'wosb-route-animation-enabled';

// =============================================================================
// GLOBAL STATE
// =============================================================================
let map;
let layerGroups = {};
let overlayLayers = {};
let customMarkers = [];
let customLayerGroup;
let myIslands = []; // array of { id, x, y, customName, workshop, production }
let myMines = [];   // array of { id, x, y, customName }
let myPrintshops = []; // array of { id, x, y, customName }
let myPorts = [];   // array of { name, x, y, hasWarehouse, workshops: string[] }
let myIslandRadiusCircles = {};
let myIslandDecorationLayers = {};
let myPortDecorationLayers = {};
let myProductionDecorationLayers = {};
let currentStatusDisplayMode = null;
window.poiMarkers = {}; // map of type_id -> marker

const ISLAND_WORKSHOPS = ['ws_plank', 'ws_weaving', 'ws_bronze', 'ws_plate', 'ws_bulkhead', 'ws_provision'];
const ISLAND_PRODUCTIONS = ['prod_beer', 'prod_grain', 'prod_supplies', 'prod_sugar'];
const PORT_WORKSHOPS = ['pw_plank', 'pw_bronze', 'pw_plate', 'pw_canvas', 'pw_bulkhead', 'pw_foundry'];
const MAP_STATUS_LABELS = {
  en: {
    warehouse: 'Warehouse',
    ws_plank: 'Beam',
    ws_weaving: 'Weaving',
    ws_bronze: 'Bronze',
    ws_plate: 'Plate',
    ws_bulkhead: 'Bulkhead',
    ws_provision: 'Provisions',
    prod_beer: 'Beer',
    prod_grain: 'Grain',
    prod_supplies: 'Supplies',
    prod_sugar: 'Sugar',
    pw_plank: 'Beam',
    pw_bronze: 'Bronze',
    pw_plate: 'Plate',
    pw_canvas: 'Canvas',
    pw_bulkhead: 'Bulkhead',
    pw_foundry: 'Foundry'
  },
  de: {
    warehouse: 'Lager',
    ws_plank: 'Balken',
    ws_weaving: 'Weberei',
    ws_bronze: 'Bronze',
    ws_plate: 'Platte',
    ws_bulkhead: 'Schott',
    ws_provision: 'Proviant',
    prod_beer: 'Bier',
    prod_grain: 'Getreide',
    prod_supplies: 'Vorräte',
    prod_sugar: 'Zucker',
    pw_plank: 'Balken',
    pw_bronze: 'Bronze',
    pw_plate: 'Platte',
    pw_canvas: 'Segeltuch',
    pw_bulkhead: 'Schott',
    pw_foundry: 'Gießerei'
  }
};
let distanceRoutes = []; // Array of { id, points, layerGroup }
let activeDistancePoints = [];
let activeDistanceLayers = [];
let measureSnapTargets = [];
let snapCursorProxy = null;
let searchIndex = -1;
let isMobile = window.innerWidth <= 768;
let currentLang = 'en';
let savedDistanceRoutesVisible = true;
let routeAnimationsEnabled = true;
let clearDistancePreview = () => { };
let contextMenuItems = [];
let contextMenuActiveIndex = -1;
let contextMenuLatLng = null;
let personalListFilters = new Set();
const PERSONAL_LIST_FILTER_KEYS = ['islands', 'ports', 'resources', 'custom'];

// =============================================================================
// LOCALIZATION HELPERS
// =============================================================================
function t(key) { return (i18n[currentLang] && i18n[currentLang][key]) || i18n.en[key] || key; }
function tf(key, params = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`));
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}
function portName(port) { return currentLang === 'de' && port.name_de ? port.name_de : port.name; }
function normalizeSearchText(value) { return String(value ?? '').toLocaleLowerCase(); }
function getPortZoneName(port) { return port ? portZones[port.name] || null : null; }
function getPortAliases(port) {
  const aliases = new Set([port.name, port.name_de, ...(portSearchAliases[port.name] || [])].filter(Boolean));
  return [...aliases];
}
function getMapStatusLabel(key) {
  return MAP_STATUS_LABELS[currentLang]?.[key] || MAP_STATUS_LABELS.en[key] || t(key);
}
function hasOutsidePoiVariant(type) {
  return ['water', 'printshop', 'altar', 'fort'].includes(type);
}
function getLighthouseMarkerKey(lighthouse) {
  return 'lighthouse_' + (lighthouse.id || (String(lighthouse.x) + '_' + String(lighthouse.y)));
}
function getStatusDisplayMode() {
  const zoom = map?.getZoom?.() ?? DEFAULT_ZOOM;
  if (zoom >= 2) return 'inline';
  if (zoom >= 1) return 'callout';
  return 'compact';
}
function getCompactStatusItems(badges) {
  if (badges.length <= 2) return badges;
  return [...badges.slice(0, 2), { tone: 'count', label: `+${badges.length - 2}` }];
}
function buildCompactSummaryHtml(badges) {
  const items = getCompactStatusItems(badges);
  return `<div class="map-status-summary">${items.map((item, index) => `
    ${index ? '<span class="map-status-summary-sep">·</span>' : ''}
    <span class="map-status-summary-item map-status-summary-tone-${item.tone}">
      <span class="map-status-summary-dot"></span>
      <span class="map-status-summary-label">${escapeHtml(item.label)}</span>
    </span>
  `).join('')}</div>`;
}
function buildStatusRowsHtml(badges, maxPerRow) {
  const rows = [];
  for (let index = 0; index < badges.length; index += maxPerRow) {
    rows.push(badges.slice(index, index + maxPerRow));
  }
  return rows.map(row => `
    <div class="map-status-row">
      ${row.map(badge => `<span class="map-status-badge map-status-tone-${badge.tone}">${escapeHtml(badge.label)}</span>`).join('')}
    </div>
  `).join('');
}
function getStatusCalloutLayout(latlng, options = {}) {
  const mode = getStatusDisplayMode();
  if (options.forceInline) {
    if (!map) {
      return { mode: 'inline', side: 'right', vertical: 'center', dx: 0, dy: -6, angle: -90, length: 0 };
    }
    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const reservedWidth = options.variant === 'port' ? 180 : 160;
    const preferRight = point.x <= size.x - reservedWidth;
    return { mode: 'inline', side: preferRight ? 'right' : 'left', vertical: 'center', dx: 0, dy: -6, angle: -90, length: 0 };
  }

  if (mode === 'inline') {
    if (!map) {
      return {
        mode: 'inline',
        side: 'right',
        vertical: 'above',
        dx: 0,
        dy: options.variant === 'port' ? -64 : -46,
        angle: -90,
        length: 0
      };
    }

    const point = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const reservedWidth = options.variant === 'port' ? 180 : 160;
    const preferRight = point.x <= size.x - reservedWidth;
    return {
      mode: 'inline',
      side: preferRight ? 'right' : 'left',
      vertical: 'above',
      dx: 0,
      dy: options.variant === 'port' ? -64 : -46,
      angle: -90,
      length: 0
    };
  }

  if (!map) {
    return {
      mode: 'callout',
      side: 'right',
      vertical: 'above',
      dx: options.variant === 'port' ? 18 : 16,
      dy: options.variant === 'port' ? -20 : -16,
      angle: -45,
      length: 12
    };
  }

  const point = map.latLngToContainerPoint(latlng);
  const size = map.getSize();
  const preferRight = point.x <= size.x * 0.62;
  const preferAbove = point.y >= size.y * 0.28;
  const baseX = mode === 'compact'
    ? (options.variant === 'port' ? 12 : 10)
    : (options.variant === 'port' ? 18 : 16);
  const baseY = mode === 'compact'
    ? (options.variant === 'port' ? 14 : 12)
    : (options.variant === 'port' ? 20 : 16);
  const dx = (preferRight ? 1 : -1) * baseX;
  const dy = (preferAbove ? -1 : 1) * baseY;

  return {
    mode,
    side: preferRight ? 'right' : 'left',
    vertical: preferAbove ? 'above' : 'below',
    dx,
    dy,
    angle: Math.atan2(dy, dx) * (180 / Math.PI),
    length: Math.max(12, Math.hypot(dx, dy) - (mode === 'compact' ? 8 : 10))
  };
}
function createStatusBadgeMarker(latlng, badges, options = {}) {
  if (!badges || badges.length === 0) return null;

  const layout = getStatusCalloutLayout(latlng, options);
  const variantClass = options.variant ? ` map-status-${options.variant}` : '';

  if (layout.mode === 'inline') {
    const rowsHtml = buildStatusRowsHtml(badges, options.maxPerRow || 2);
    return L.marker(latlng, {
      interactive: false,
      keyboard: false,
      pane: 'statusPane',
      zIndexOffset: 250,
      icon: L.divIcon({
        className: 'map-status-host',
        html: `<div class="map-status-stack map-status-inline-${layout.side}${variantClass}">${rowsHtml}</div>`,
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      })
    });
  }

  const bodyHtml = layout.mode === 'compact'
    ? buildCompactSummaryHtml(badges)
    : buildStatusRowsHtml(badges, options.maxPerRow || 2);
  const cardModeClass = layout.mode === 'compact' ? ' map-status-card-compact' : ' map-status-card-rich';
  const html = `
    <div class="map-status-callout map-status-mode-${layout.mode}${variantClass} map-status-${layout.side} map-status-${layout.vertical}" style="--callout-dx:${layout.dx}px; --callout-dy:${layout.dy}px; --callout-angle:${layout.angle}deg; --callout-length:${layout.length}px;">
      <span class="map-status-leader"></span>
      <div class="map-status-card${cardModeClass}">
        ${bodyHtml}
      </div>
    </div>
  `;

  return L.marker(latlng, {
    interactive: false,
    keyboard: false,
    pane: 'statusPane',
    zIndexOffset: 250,
    icon: L.divIcon({
      className: 'map-status-host',
      html,
      iconSize: [1, 1],
      iconAnchor: [0, 0]
    })
  });
}
function createPersonalHighlightLayers(latlng, kind) {
  const config = {
    island: { color: '#22c55e', radius: 18 },
    port: { color: '#f59e0b', radius: 20 },
    resource: { color: '#38bdf8', radius: 15 },
    printshop: { color: '#c084fc', radius: 15 },
    outsideProduction: { color: '#ef4444', radius: 15 }
  }[kind];
  if (!config) return [];

  return [
    L.circleMarker(latlng, {
      pane: 'highlightPane',
      interactive: false,
      keyboard: false,
      radius: config.radius + 2,
      color: config.color,
      opacity: 0.18,
      weight: 5,
      fillOpacity: 0
    }),
    L.circleMarker(latlng, {
      pane: 'highlightPane',
      interactive: false,
      keyboard: false,
      radius: config.radius,
      color: config.color,
      opacity: 0.92,
      weight: 2.75,
      fillOpacity: 0
    })
  ];
}
function getOverlaySourceUrl(layerKey, quality = 'low') {
  const sources = PROGRESSIVE_OVERLAY_SOURCES[layerKey];
  if (!sources) return null;
  return ASSETS_PATH + (sources[quality] || sources.low);
}
function preloadOverlayImage(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
function upgradeOverlayToHighRes(layerKey, overlay) {
  const lowUrl = getOverlaySourceUrl(layerKey, 'low');
  const highUrl = getOverlaySourceUrl(layerKey, 'high');
  if (!overlay || !highUrl || highUrl === lowUrl) return;

  document.body.dataset[`${layerKey}Quality`] = 'low';
  preloadOverlayImage(highUrl).then(success => {
    if (!success) return;
    overlay.setUrl(highUrl);
    document.body.dataset[`${layerKey}Quality`] = 'high';
  });
}
function createProgressiveImageOverlay(layerKey, bounds, options = {}) {
  const overlay = L.imageOverlay(getOverlaySourceUrl(layerKey, 'low'), bounds, options);
  overlay.once('load', () => upgradeOverlayToHighRes(layerKey, overlay));
  return overlay;
}
function createDistanceLabelIcon(value) {
  return L.divIcon({
    className: 'distance-label',
    html: `${value}`,
    iconSize: MEASURE_LABEL_ICON_SIZE,
    iconAnchor: [MEASURE_LABEL_ICON_SIZE[0] / 2, MEASURE_LABEL_ICON_SIZE[1] / 2]
  });
}
function createDistancePointHandleIcon() {
  return L.divIcon({
    className: 'distance-point-handle',
    html: '<span class="distance-point-handle-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}
function loadBooleanPreference(key, fallback = true) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1';
  } catch (_) {
    return fallback;
  }
}
function saveBooleanPreference(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch (_) {}
}
function setRouteAnimationsEnabled(enabled, options = {}) {
  routeAnimationsEnabled = enabled;
  document.documentElement.dataset.routeAnimations = enabled ? 'on' : 'off';
  if (options.persist !== false) saveBooleanPreference(ROUTE_ANIMATION_STORAGE_KEY, enabled);
}
function setSavedDistanceRoutesVisible(visible, options = {}) {
  savedDistanceRoutesVisible = visible;
  if (map) {
    distanceRoutes.forEach(route => {
      if (!route?.layerGroup) return;
      if (visible) route.layerGroup.addTo(map);
      else map.removeLayer(route.layerGroup);
    });
  }
  if (options.persist !== false) saveBooleanPreference(DISTANCE_ROUTES_VISIBLE_STORAGE_KEY, visible);
}
function saveDistanceRoutes() {
  try {
    const payload = distanceRoutes.map(route => ({
      id: route.id,
      points: route.points.map(point => ({ lat: point.lat, lng: point.lng }))
    }));
    localStorage.setItem(DISTANCE_ROUTES_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save distance routes', error);
  }
}
function loadSavedDistanceRoutes() {
  try {
    const raw = localStorage.getItem(DISTANCE_ROUTES_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(saved)) return;
    distanceRoutes.forEach(route => map.removeLayer(route.layerGroup));
    distanceRoutes = [];
    saved.forEach((route, index) => {
      if (!route || !Array.isArray(route.points)) return;
      const points = route.points
        .map(point => L.latLng(Number(point.lat), Number(point.lng)))
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (points.length < 2) return;
      const restoredRoute = {
        id: Number(route.id) || (Date.now() + index),
        points,
        layerGroup: L.layerGroup()
      };
      distanceRoutes.push(restoredRoute);
      renderSavedRoute(restoredRoute);
      if (savedDistanceRoutesVisible) restoredRoute.layerGroup.addTo(map);
    });
  } catch (error) {
    console.error('Failed to load distance routes', error);
  }
}
function deleteDistanceRouteStage(route, pointIndex) {
  if (!route || pointIndex <= 0) return;
  if (route.points.length <= 2) {
    map.removeLayer(route.layerGroup);
    distanceRoutes = distanceRoutes.filter(entry => entry.id !== route.id);
    saveDistanceRoutes();
    return;
  }
  route.points.splice(pointIndex, 1);
  renderSavedRoute(route);
  saveDistanceRoutes();
}
function getMeasurePointDistance(a, b) {
  return Math.hypot(b.lng - a.lng, b.lat - a.lat);
}
function getMeasureMidpoint(a, b) {
  return L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
}

function getMeasureLabelLatLng(a, b, options = {}) {
  if (!map) return getMeasureMidpoint(a, b);
  const start = map.latLngToContainerPoint(a);
  const end = map.latLngToContainerPoint(b);
  const mapRect = map.getContainer().getBoundingClientRect();
  const ignored = new Set((options.ignoredElements || []).filter(Boolean));
  const occupiedRects = [...document.querySelectorAll('.map-status-stack, .map-status-card, .distance-label')]
    .filter(el => !ignored.has(el))
    .map(el => el.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => ({
      left: rect.left - mapRect.left,
      top: rect.top - mapRect.top,
      right: rect.right - mapRect.left,
      bottom: rect.bottom - mapRect.top
    }));
  const candidates = [0.5, 0.36, 0.64, 0.22, 0.78, 0.1, 0.9];
  const halfWidth = MEASURE_LABEL_ICON_SIZE[0] / 2;
  const halfHeight = MEASURE_LABEL_ICON_SIZE[1] / 2;
  const padding = 6;

  for (const t of candidates) {
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const candidateRect = {
      left: x - halfWidth,
      top: y - halfHeight,
      right: x + halfWidth,
      bottom: y + halfHeight
    };
    const collides = occupiedRects.some(rect => !(candidateRect.right + padding < rect.left || candidateRect.left - padding > rect.right || candidateRect.bottom + padding < rect.top || candidateRect.top - padding > rect.bottom));
    if (!collides) return map.containerPointToLatLng(L.point(x, y));
  }

  return getMeasureMidpoint(a, b);
}
function ensureAnimatedRoute(line) {
  if (!line) return line;
  const apply = () => {
    const path = line._path;
    if (!path) return;
    path.classList.add('animated-route');
    path.style.strokeLinecap = 'round';
    path.style.strokeDasharray = '6 4';
    path.style.strokeDashoffset = '0';
    path.style.willChange = 'stroke-dashoffset';
    path.style.removeProperty('animation');
  };
  apply();
  requestAnimationFrame(apply);
  return line;
}
function buildMeasureSnapTargets() {
  measureSnapTargets = [
    ...ports.map(port => ({ type: 'port', latlng: L.latLng(-port.y, port.x), marker: window.poiMarkers['port_' + port.name] || null })),
    ...lighthouses.map(lighthouse => ({ type: 'lighthouse', latlng: L.latLng(-lighthouse.y, lighthouse.x), marker: window.poiMarkers[getLighthouseMarkerKey(lighthouse)] || null })),
    ...pois.filter(poi => poi.type === 'island').map(island => ({ type: 'island', latlng: px(island.x, island.y), marker: window.poiMarkers['island_' + island.id] || null })),
    ...pois.filter(prod => PRODUCTION_TYPES.includes(prod.type)).map(prod => ({ type: prod.type, latlng: L.latLng(-prod.y, prod.x), marker: window.poiMarkers['mine_' + prod.id] || null })),
    ...pois.filter(poi => poi.type === 'altar').map(altar => ({ type: 'altar', latlng: L.latLng(-altar.y, altar.x), marker: window.poiMarkers['altar_' + altar.id] || null })),
    ...pois.filter(poi => poi.type === 'fort').map(fort => ({ type: 'fort', latlng: L.latLng(-fort.y, fort.x), marker: window.poiMarkers['fort_' + fort.id] || null })),
    ...customMarkers.map(marker => ({ type: 'custom', latlng: L.latLng(marker.lat, marker.lng), marker: window.poiMarkers['custom_' + marker.id] || null }))
  ];
}
function getRenderableSnapMarker(target) {
  if (!target?.marker) return null;
  if (target.marker._icon) return target.marker;
  if (target.type === 'lighthouse' && layerGroups.lighthouses?.getVisibleParent) {
    const visibleParent = layerGroups.lighthouses.getVisibleParent(target.marker);
    if (visibleParent?._icon) return visibleParent;
  }
  return null;
}
function ensureSnapCursorProxy() {
  if (snapCursorProxy || !map) return snapCursorProxy;
  const el = document.createElement('div');
  el.className = 'map-snap-cursor';
  map.getContainer().appendChild(el);
  snapCursorProxy = el;
  return el;
}
function updateSnapCursor(point, snapped = false) {
  const cursor = ensureSnapCursorProxy();
  if (!cursor || !point) return;
  map?.getContainer?.()?.classList.add('snap-cursor-enabled');
  cursor.classList.add('is-visible');
  cursor.classList.toggle('is-snapped', snapped);
  cursor.style.transform = 'translate(' + point.x + 'px, ' + point.y + 'px) translate(-50%, -50%)';
}
function hideSnapCursor() {
  if (snapCursorProxy) snapCursorProxy.classList.remove('is-visible', 'is-snapped', 'is-measure');
  map?.getContainer?.()?.classList.remove('snap-cursor-enabled');
}
function setMapDragCursor(enabled) {
  const c = map?.getContainer?.();
  if (!c) return;
  c.classList.toggle('map-drag-cursor', enabled);
  if (enabled) {
    c.classList.remove('snap-cursor-enabled');
    hideSnapCursor();
  }
}
function setSnapCursorMeasureMode(enabled) {
  const cursor = ensureSnapCursorProxy();
  if (!cursor) return;
  cursor.classList.toggle('is-measure', enabled);
}
function setActiveSnapMarker() {
}
function clearActiveSnapMarker() {
}
function initPointerSnap() {
  const container = map?.getContainer?.();
  if (!map || !container) return;

  container.classList.add('snap-cursor-enabled');
  ensureSnapCursorProxy();

  map.on('mousemove', e => {
    if (container.classList.contains('measure-mode')) return;
    const snapTarget = findMeasureSnapTarget(e.latlng);
    const renderedMarker = snapTarget ? getRenderableSnapMarker(snapTarget) : null;
    if (renderedMarker?._icon) {
      setActiveSnapMarker(renderedMarker);
      updateSnapCursor(map.latLngToContainerPoint(renderedMarker.getLatLng()), true);
    } else {
      clearActiveSnapMarker();
      updateSnapCursor(e.containerPoint, false);
    }
  });

  map.on('movestart zoomstart', () => {
    clearActiveSnapMarker();
    hideSnapCursor();
  });
  map.on('mousedown', e => {
    if (container.classList.contains('measure-mode')) return;
    if (e.originalEvent?.button === 0) setMapDragCursor(true);
  });
  map.on('mouseup dragend', () => setMapDragCursor(false));
  container.addEventListener('mouseenter', () => container.classList.add('snap-cursor-enabled'));
  container.addEventListener('mouseleave', () => {
    clearActiveSnapMarker();
    hideSnapCursor();
    setMapDragCursor(false);
  });
}
function findMeasureSnapTarget(latlng) {
  if (!map || measureSnapTargets.length === 0) return null;
  const pointerPoint = map.latLngToLayerPoint(latlng);
  let bestTarget = null;
  let bestDistance = Infinity;

  measureSnapTargets.forEach(target => {
    const renderedMarker = getRenderableSnapMarker(target);
    if (target.marker && !renderedMarker) return;
    const targetLatLng = renderedMarker?.getLatLng?.() || target.latlng;
    const targetPoint = map.latLngToLayerPoint(targetLatLng);
    const distance = pointerPoint.distanceTo(targetPoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTarget = { ...target, marker: renderedMarker || target.marker, latlng: targetLatLng };
    }
  });

  if (!bestTarget || bestDistance > MEASURE_SNAP_DISTANCE_PX) return null;
  return bestTarget;
}
function resolveMeasureLatLng(latlng) {
  return findMeasureSnapTarget(latlng)?.latlng || latlng;
}
function findNearestPort(x, y) {
  let nearest = null;
  ports.forEach(port => {
    const distancePx = Math.hypot(port.x - x, port.y - y);
    if (!nearest || distancePx < nearest.distancePx) {
      nearest = { port, distancePx };
    }
  });
  return nearest;
}
function inferIslandZoneDetails(x, y) {
  const nearest = findNearestPort(x, y);
  return {
    zoneName: nearest ? getPortZoneName(nearest.port) : null,
    nearestPort: nearest ? nearest.port : null,
    distancePx: nearest ? nearest.distancePx : null
  };
}
function syncIslandMetadata(islandEntry) {
  const details = inferIslandZoneDetails(islandEntry.x, islandEntry.y);
  return {
    ...islandEntry,
    customName: islandEntry.customName || null,
    workshop: islandEntry.workshop || null,
    production: islandEntry.production || null,
    zoneName: details.zoneName || islandEntry.zoneName || null,
    nearestPortName: details.nearestPort?.name || islandEntry.nearestPortName || null
  };
}
function persistMyIslands() {
  myIslands = myIslands.map(syncIslandMetadata);
  localStorage.setItem('wosb-my-islands', JSON.stringify(myIslands));
}
function loadPersonalListFilters() {
  const fallback = [...PERSONAL_LIST_FILTER_KEYS];
  try {
    const saved = JSON.parse(localStorage.getItem('wosb-personal-list-filters') || 'null');
    const valid = Array.isArray(saved) ? saved.filter(key => PERSONAL_LIST_FILTER_KEYS.includes(key)) : [];
    personalListFilters = new Set(valid.length ? valid : fallback);
  } catch (error) {
    personalListFilters = new Set(fallback);
  }
}
function savePersonalListFilters() {
  localStorage.setItem('wosb-personal-list-filters', JSON.stringify([...personalListFilters]));
}
window.togglePersonalListFilter = function (filterKey) {
  if (!PERSONAL_LIST_FILTER_KEYS.includes(filterKey)) return;
  if (personalListFilters.has(filterKey)) personalListFilters.delete(filterKey);
  else personalListFilters.add(filterKey);
  savePersonalListFilters();

  buildMeasureSnapTargets();
  updatePersonalPOIList();
};
function sortStatusBadges(badges) {
  const toneOrder = { production: 0, workshop: 1, warehouse: 2, neutral: 3, count: 4 };
  return badges.slice().sort((a, b) => {
    const toneDelta = (toneOrder[a.tone] ?? 9) - (toneOrder[b.tone] ?? 9);
    if (toneDelta !== 0) return toneDelta;
    return String(a.label).localeCompare(String(b.label), currentLang);
  });
}
function getIslandStatusBadges(island, labelResolver = t, options = {}) {
  const context = options.context || 'sidebar';
  const badges = [];
  if (island.production) badges.push({ tone: 'production', label: labelResolver(island.production) });
  if (island.workshop) badges.push({ tone: 'workshop', label: labelResolver(island.workshop) });
  if (!badges.length && context !== 'map') badges.push({ tone: 'neutral', label: labelResolver('notSet') });
  return sortStatusBadges(badges);
}
function getPortStatusBadges(portEntry, labelResolver = t, options = {}) {
  const context = options.context || 'sidebar';
  const badges = [];
  if (portEntry.workshops?.length) {
    portEntry.workshops.forEach(workshop => badges.push({ tone: 'workshop', label: labelResolver(workshop) }));
  }
  if (context !== 'map' && portEntry.hasWarehouse) {
    badges.push({ tone: 'warehouse', label: labelResolver('warehouse') });
  }
  if (!badges.length) {
    if (context === 'map' && portEntry.hasWarehouse) badges.push({ tone: 'warehouse', label: labelResolver('warehouse') });
    else if (context !== 'map') badges.push({ tone: 'neutral', label: labelResolver('notSet') });
  }
  return sortStatusBadges(badges);
}
function getIslandWorkshopOptions(zoneName, currentValue = null) {
  const options = [...(islandWorkshopOptionsByZone[zoneName] || islandWorkshopOptionsByZone.default || ISLAND_WORKSHOPS)];
  if (currentValue && !options.includes(currentValue)) options.unshift(currentValue);
  return [...new Set(options)];
}
function getIslandProductionOptions(zoneName, currentValue = null) {
  const options = [...(islandProductionOptionsByZone[zoneName] || islandProductionOptionsByZone.default || ISLAND_PRODUCTIONS)];
  if (currentValue && !options.includes(currentValue)) options.unshift(currentValue);
  return [...new Set(options)];
}

function getPopupPanPadding() {
  const sidebar = document.getElementById('sidebar');
  const mobileMenu = document.querySelector('.mobile-menu-toggle');
  const sidebarWidth = sidebar ? Math.ceil(sidebar.getBoundingClientRect().width) : 0;
  const sidebarOpen = !!sidebar && (!sidebar.classList.contains('collapsed') || sidebar.classList.contains('mobile-open'));
  const mobileToggleOffset = mobileMenu ? Math.ceil(mobileMenu.getBoundingClientRect().right) + 16 : 20;
  const leftPadding = sidebarOpen ? Math.max(sidebarWidth + 24, mobileToggleOffset) : mobileToggleOffset;
  return {
    paddingTopLeft: L.point(leftPadding, 20),
    paddingBottomRight: L.point(20, 20)
  };
}

function keepPopupInViewport(popup) {
  if (!map || !popup || typeof popup.getLatLng !== 'function') return;
  requestAnimationFrame(() => {
    if (!map || !popup.isOpen || !popup.isOpen()) return;
    const popupEl = popup.getElement ? popup.getElement() : popup._container;
    if (!popupEl) return;
    const mapContainer = map.getContainer();
    const mapRect = mapContainer.getBoundingClientRect();
    const popupRect = popupEl.getBoundingClientRect();
    const padding = getPopupPanPadding();
    const padLeft = padding.paddingTopLeft.x;
    const padTop = padding.paddingTopLeft.y;
    const padRight = padding.paddingBottomRight.x;
    const padBottom = padding.paddingBottomRight.y;
    let dx = 0;
    let dy = 0;
    if (popupRect.left < mapRect.left + padLeft) {
      dx = popupRect.left - (mapRect.left + padLeft);
    } else if (popupRect.right > mapRect.right - padRight) {
      dx = popupRect.right - (mapRect.right - padRight);
    }
    if (popupRect.top < mapRect.top + padTop) {
      dy = popupRect.top - (mapRect.top + padTop);
    } else if (popupRect.bottom > mapRect.bottom - padBottom) {
      dy = popupRect.bottom - (mapRect.bottom - padBottom);
    }
    if (dx !== 0 || dy !== 0) {
      map.panBy([dx, dy], { animate: true });
    }
  });
}
function updateLayerCounts() {
  const counts = {
    ports: ports.length,
    lighthouses: lighthouses.length,
    islands: pois.filter(p => p.type === 'island').length,
    production: pois.filter(p => PRODUCTION_TYPES.includes(p.type)).length,
    altars: pois.filter(p => p.type === 'altar').length,
    forts: pois.filter(p => p.type === 'fort').length
  };
  document.querySelectorAll('.toggle-count[data-count-key]').forEach(el => {
    const key = el.dataset.countKey;
    if (key && key in counts) el.textContent = counts[key];
  });
}
function renderShortcutList() {
  const container = document.getElementById('shortcuts-list');
  if (!container) return;
  const shortcuts = [
    ['1-9', t('toggleLayers')],
    ['Ctrl+Click', t('measure')],
    ['Ctrl+F', t('search')],
    ['D', t('darkMode')],
    ['L', t('toggleLegend')],
    [t('shortcutRightClick'), t('addMarkerLabel')]
  ];
  container.innerHTML = shortcuts.map(([keys, label]) => `
    <div><kbd style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${keys}</kbd> ${label}</div>
  `).join('');
}

function detectLanguage() {
  const saved = localStorage.getItem('wosb-lang');
  if (saved) return saved;
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return nav.startsWith('de') ? 'de' : 'en';
}

function setLanguage(lang, options = {}) {
  if (!i18n[lang]) return;
  const changed = currentLang !== lang;
  currentLang = lang;
  localStorage.setItem('wosb-lang', lang);
  applyLanguage();
  saveUrlState();
  if (!options.silent && changed) {
    showToast(lang === 'de' ? t('languageChangedGerman') : t('languageChangedEnglish'), 'info');
  }
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  document.title = `${t('title')} - ${t('subtitle')}`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('metaDescription'));
  const loadingEl = document.querySelector('.map-loading');
  if (loadingEl) loadingEl.textContent = t('loadingMap');

  const titleEl = document.querySelector('.sidebar-header h1');
  if (titleEl) titleEl.innerHTML = '⚓ ' + t('title');
  const subEl = document.querySelector('.sidebar-header .subtitle');
  if (subEl) subEl.textContent = t('subtitle');

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.placeholder = t('searchPlaceholder');
    searchInput.setAttribute('aria-label', t('search'));
  }
  const searchTrigger = document.getElementById('search-trigger');
  if (searchTrigger) {
    searchTrigger.setAttribute('title', t('search'));
    searchTrigger.setAttribute('aria-label', t('search'));
  }

  const layerTitle = document.getElementById('section-title-layers');
  if (layerTitle) layerTitle.textContent = t('mapLayers');
  setLabelText('toggle-ports', t('ports'));
  setLabelText('toggle-lighthouses', t('lighthouses'));
  setLabelText('toggle-routes', t('fastTravel'));
  setLabelText('toggle-distance-routes', t('savedRoutes'));
  setLabelText('toggle-route-animation', t('routeAnimation'));
  setLabelText('toggle-islands', t('islands'));
  setLabelText('toggle-production', t('production'));
  setLabelText('toggle-altars', t('altars'));
  setLabelText('toggle-forts', t('forts'));
  setLabelText('toggle-pvp', t('pvpCircle'));
  setLabelText('toggle-custom', t('customMarkers'));
  setLabelText('toggle-myisland', t('myIsland'));
  setLabelText('toggle-radius', t('islandRadius'));

  const legendTitle = document.getElementById('section-title-legend');
  if (legendTitle) legendTitle.textContent = t('iconLegend');
  const kbHeader = document.querySelector('#shortcuts-header .layer-section-title');
  if (kbHeader) kbHeader.textContent = t('keyboardShortcuts');
  const imprintHeader = document.getElementById('section-title-imprint');
  if (imprintHeader) imprintHeader.textContent = t('imprint');
  const imprintContent = document.getElementById('imprint-content');
  if (imprintContent) {
    imprintContent.innerHTML = `
      <p>${escapeHtml(t('imprintIntro'))}</p>
      <p>${escapeHtml(t('imprintRights'))}</p>
      <p>${escapeHtml(t('imprintAffiliation'))}</p>
    `;
  }
  const poiHeader = document.getElementById('section-title-myisland');
  if (poiHeader) poiHeader.textContent = t('myIsland');

  setText('btn-export', '⬇ ' + t('exportMarkers'));
  setText('btn-import', '⬆ ' + t('importMarkers'));

  const dialogTitle = document.querySelector('#marker-dialog h3');
  if (dialogTitle) dialogTitle.textContent = '📌 ' + t('addMarkerDialog');
  const labelInput = document.getElementById('marker-label-input');
  if (labelInput) labelInput.placeholder = t('markerLabelPlaceholder');
  setText('marker-cancel', t('cancel'));
  setText('marker-confirm', t('addMarker'));
  const islandDialogTitle = document.getElementById('island-dialog-title');
  if (islandDialogTitle) islandDialogTitle.textContent = t('nameYourIsland');
  const islandLabelInput = document.getElementById('island-label-input');
  if (islandLabelInput) islandLabelInput.placeholder = t('islandNamePlaceholder');
  setText('island-cancel', t('cancel'));
  setText('island-confirm', t('save'));

  const distLabel = document.querySelector('#distance-info .dist-label');
  if (distLabel) distLabel.textContent = t('distance') + ': ';
  setText('distance-clear', t('clearMeasure'));
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.setAttribute('title', t('toggleSidebar'));
    sidebarToggle.setAttribute('aria-label', t('toggleSidebar'));
  }
  const darkModeBtn = document.getElementById('btn-darkmode');
  if (darkModeBtn) {
    darkModeBtn.setAttribute('title', t('toggleDarkModeTitle'));
    darkModeBtn.setAttribute('aria-label', t('toggleDarkModeTitle'));
  }
  document.getElementById('context-menu')?.setAttribute('aria-label', t('mapActions'));

  document.getElementById('btn-lang-en')?.classList.toggle('active', currentLang === 'en');
  document.getElementById('btn-lang-de')?.classList.toggle('active', currentLang === 'de');

  if (layerGroups.ports) {
    layerGroups.ports.eachLayer(marker => {
      if (marker.portRef && marker.getTooltip()) {
        marker.getTooltip().setContent(portName(marker.portRef));
      }
    });
  }

  updateLayerCounts();
  updateCollapseAllLabel();
  renderShortcutList();

  const legendGrid = document.getElementById('legend-grid');
  if (legendGrid) {
    const items = [
      { icon: 'n', key: 'normalPort' },
      { icon: 'k', key: 'smallPort' },
      { icon: 'f', key: 'fortifiedPort' },
      { icon: 'p', key: 'piratePort' },
      { icon: 'lh', key: 'lighthouse' },
      { icon: 'island', key: 'personalIsland' },
      { icon: 'coal', key: 'coal' },
      { icon: 'copper', key: 'copper' },
      { icon: 'farm', key: 'farm' },
      { icon: 'iron', key: 'iron' },
      { icon: 'resin', key: 'resin' },
      { icon: 'rum', key: 'rum' },
      { icon: 'water', key: 'water' },
      { icon: 'wood', key: 'wood' },
      { icon: 'printshop', key: 'printshop' },
      { icon: 'altar', key: 'altar' },
      { icon: 'fort', key: 'fort' }
    ];
    legendGrid.innerHTML = items.map(item =>
      `<div class="legend-item"><img src="assets/${item.icon}.png" alt="${t(item.key)}"> ${t(item.key)}</div>`
    ).join('');
  }

  if (typeof refreshPOIStyles === 'function') refreshPOIStyles();
  else if (typeof updatePersonalPOIList === 'function') updatePersonalPOIList();
  map?.closePopup?.();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setLabelText(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const label = el.querySelector('.toggle-label');
  if (label) label.textContent = text;
}
const PORT_TYPE_NAMES_KEY = { k: 'smallPort', n: 'normalPort', f: 'fortifiedPort', p: 'piratePort' };
const PORT_TYPE_TAGS = { k: 'tag-small', n: 'tag-normal', f: 'tag-fortified', p: 'tag-pirate' };

// =============================================================================
// INITIALIZATION
// =============================================================================
function finishAppInit(status, error = null) {
  document.body.dataset.initState = status;
  if (error) {
    const message = String(error?.message || error);
    document.body.dataset.initError = message;
    console.error('WoSB map initialization failed:', error);
    if (typeof showToast === 'function') {
      showToast(tf('mapInitError', { message }), 'error');
    }
  } else {
    delete document.body.dataset.initError;
  }
  hideLoading();
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    currentLang = detectLanguage();
    initMap();
    initLayers();
    initSidebar();
    initSearch();
    initCustomMarkers();
    initPersonalState();
    initDistanceTool();
    initPointerSnap();
    initKeyboardShortcuts();
    initContextMenu();
    initExportImport();
    initLanguageToggle();
    applyLanguage();
    restoreUrlState();
    finishAppInit('ok');
  } catch (error) {
    finishAppInit('error', error);
  }
});

// =============================================================================
// MAP SETUP
// =============================================================================
function initMap() {
  // Disable Leaflet's built-in popup autoPan – our keepPopupInViewport handles
  // panning based on the actual popup DOM rect which is more accurate
  L.Popup.prototype.options.autoPan = false;

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Custom pane for port labels (highest z-index)
  map.createPane('portLabels');
  map.getPane('portLabels').style.zIndex = 700;
  map.getPane('portLabels').style.pointerEvents = 'none';

  map.createPane('statusPane');
  map.getPane('statusPane').style.zIndex = 680;
  map.getPane('statusPane').style.pointerEvents = 'none';

  map.createPane('highlightPane');
  // Keep personal highlight rings above resource/port markers, but below status callouts.
  map.getPane('highlightPane').style.zIndex = 610;
  map.getPane('highlightPane').style.pointerEvents = 'none';

  // Custom pane for radius circle (above map image)
  map.createPane('radiusPane');
  map.getPane('radiusPane').style.zIndex = 450;

  const bounds = [[0, 0], [-MAP_HEIGHT, MAP_WIDTH]];
  overlayLayers.baseMap = createProgressiveImageOverlay('baseMap', bounds);
  overlayLayers.baseMap.addTo(map);
  map.fitBounds(bounds);
  currentStatusDisplayMode = getStatusDisplayMode();
  map.on('moveend zoomend', saveUrlState);
  map.on('zoomend', () => {
    const nextMode = getStatusDisplayMode();
    if (nextMode !== currentStatusDisplayMode) {
      currentStatusDisplayMode = nextMode;
      if (typeof refreshPOIStyles === 'function') refreshPOIStyles();
    }
  });
  map.on('popupopen', e => keepPopupInViewport(e.popup));
  window.addEventListener('resize', () => {
    if (map && map._popup) keepPopupInViewport(map._popup);
  });
}

function px(x, y) { return [-y, x]; }

// =============================================================================
// LAYER CREATION
// =============================================================================
function initLayers() {
  const bounds = [[0, 0], [-MAP_HEIGHT, MAP_WIDTH]];
  overlayLayers.circle = createProgressiveImageOverlay('circle', bounds, { opacity: 0.8 });
  overlayLayers.fastTravel = createProgressiveImageOverlay('fastTravel', bounds, { opacity: 0.85 });

  // Animated route layer
  overlayLayers.fastTravelAnimated = L.layerGroup();
  if (typeof fastTravelRoutes !== 'undefined') {
    fastTravelRoutes.forEach(route => {
      const latlngs = route.points.map(p => px(p[0], p[1]));
      overlayLayers.fastTravelAnimated.addLayer(L.polyline(latlngs, {
        color: '#ff6b4a', weight: 2.5, opacity: 0.7, dashArray: '12, 8', className: 'animated-route'
      }));
    });
  }

  layerGroups.ports = createPortMarkers();
  layerGroups.lighthouses = createLighthouseMarkers();
  layerGroups.islands = createIslandMarkers();
  layerGroups.production = createProductionMarkers();
  layerGroups.altars = createAltarMarkers();
  layerGroups.forts = createFortMarkers();

  layerGroups.ports.addTo(map);
  layerGroups.lighthouses.addTo(map);
  layerGroups.islands.addTo(map);
  layerGroups.production.addTo(map);
  layerGroups.altars.addTo(map);
  layerGroups.forts.addTo(map);
  overlayLayers.circle.addTo(map);
}
function createPortMarkers() {
  const group = L.layerGroup();
  ports.forEach(port => {
    const icon = L.icon({ iconUrl: ASSETS_PATH + port.type + '.png', iconSize: [60, 60], iconAnchor: [30, 30], popupAnchor: [0, -30] });
    const marker = L.marker(px(port.x, port.y), { icon, title: port.name });
    marker.bindPopup(() => createPortPopup(port));
    // Label as permanent tooltip — uses localized name, stays at fixed pixel offset
    const portLabel = escapeHtml(portName(port));
    marker.bindTooltip(`<span class="port-label-text">${portLabel}</span>`, {
      permanent: true,
      direction: 'bottom',
      offset: [0, 36],
      className: 'port-label-tooltip',
      pane: 'portLabels'
    });
    marker.portRef = port; // keep ref for re-rendering on lang change
    window.poiMarkers['port_' + port.name] = marker;
    group.addLayer(marker);
  });
  return group;
}

function createLighthouseMarkers() {
  const group = L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction: cluster => L.divIcon({
      html: `<div style="background:rgba(224,224,224,0.2);border:2px solid rgba(224,224,224,0.5);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:#e0e0e0;font-size:12px;font-weight:600;font-family:Inter,sans-serif;">${cluster.getChildCount()}</div>`,
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    }),
    spiderfyOnMaxZoom: true, disableClusteringAtZoom: 2
  });
  const lhIcon = L.icon({ iconUrl: ASSETS_PATH + 'lh.png', iconSize: [30, 30], iconAnchor: [15, 15] });
  lighthouses.forEach(lh => {
    const m = L.marker(px(lh.x, lh.y), { icon: lhIcon });
    m.poiData = lh;
    window.poiMarkers[getLighthouseMarkerKey(lh)] = m;
    m.bindPopup(() => `<div class="popup-content"><div class="popup-title">${t('lighthouse')}</div><div class="popup-row"><span>${t('position')}</span><span class="popup-value">${lh.x}, ${lh.y}</span></div></div>`);
    group.addLayer(m);
  });
  return group;
}

function createIslandMarkers() {
  const group = L.layerGroup();
  pois.filter(p => p.type === 'island').forEach(island => {
    const icon = L.icon({ iconUrl: ASSETS_PATH + 'island.png', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    const marker = L.marker(px(island.x, island.y), { icon });
    marker.poiData = island;
    window.poiMarkers['island_' + island.id] = marker;
    marker.bindPopup(() => createIslandPopup(island));
    group.addLayer(marker);
  });
  return group;
}

function createProductionMarkers() {
  const group = L.layerGroup();
  pois.filter(p => PRODUCTION_TYPES.includes(p.type)).forEach(prod => {
    const icon = L.icon({
      iconUrl: getIconForPoi(prod.type, prod.outsideMap),
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15],
      className: 'production-poi-icon'
    });
    const m = L.marker(px(prod.x, prod.y), { icon });
    m.poiData = prod;
    window.poiMarkers['mine_' + prod.id] = m;
    m.bindPopup(() => createProductionPopup(prod));
    group.addLayer(m);
  });
  return group;
}

function createAltarMarkers() {
  const group = L.layerGroup();
  pois.filter(p => p.type === 'altar').forEach(a => {
    const icon = L.icon({ iconUrl: getIconForPoi('altar', a.outsideMap), iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    const m = L.marker(px(a.x, a.y), { icon });
    m.poiData = a;
    window.poiMarkers['altar_' + a.id] = m;
    m.bindPopup(() => {
      let html = `<div class="popup-content"><div class="popup-title">${t('altar')} ${a.id}</div><div class="popup-row"><span>${t('position')}</span><span class="popup-value">${a.x}, ${a.y}</span></div>`;
      if (a.outsideMap) html += `<div class="popup-tag tag-outside">${t('outsideMap')}</div>`;
      return html + '</div>';
    });
    group.addLayer(m);
  });
  return group;
}

function createFortMarkers() {
  const group = L.layerGroup();
  pois.filter(p => p.type === 'fort').forEach(f => {
    const icon = L.icon({ iconUrl: getIconForPoi('fort', f.outsideMap), iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    const m = L.marker(px(f.x, f.y), { icon });
    m.poiData = f;
    window.poiMarkers['fort_' + f.id] = m;
    m.bindPopup(() => {
      let html = `<div class="popup-content"><div class="popup-title">${t('fort')} ${f.id}</div><div class="popup-row"><span>${t('position')}</span><span class="popup-value">${f.x}, ${f.y}</span></div>`;
      if (f.outsideMap) html += `<div class="popup-tag tag-outside">${t('outsideMap')}</div>`;
      return html + '</div>';
    });
    group.addLayer(m);
  });
  return group;
}

function getIconForPoi(type, outsideMap) {
  if (outsideMap && hasOutsidePoiVariant(type)) return ASSETS_PATH + type + '-r.png';
  return ASSETS_PATH + type + '.png';
}

function createPortPopup(port) {
  const name = portName(port);
  const portData = myPorts.find(p => p.name === port.name);
  const hasWarehouse = portData?.hasWarehouse || false;
  const workshops = portData?.workshops || [];
  const zoneName = getPortZoneName(port);

  const container = document.createElement('div');
  container.className = 'popup-content';
  container.innerHTML = `
    <div class="popup-title">${name}</div>
    <div class="popup-row"><span>${t('type')}</span><span class="popup-value">${t(PORT_TYPE_NAMES_KEY[port.type])}</span></div>
    <div class="popup-row"><span>${t('zone')}</span><span class="popup-value">${zoneName || t('unknownZone')}</span></div>
    <div class="popup-row"><span>${t('position')}</span><span class="popup-value">${port.x}, ${port.y}</span></div>
    <div class="popup-tag ${PORT_TYPE_TAGS[port.type]}">${t(PORT_TYPE_NAMES_KEY[port.type])}</div>
    <div class="popup-section">
      <div class="popup-actions">
        <button type="button" class="popup-action-btn port-warehouse-btn ${hasWarehouse ? 'action-warehouse' : 'action-neutral'}">
          📦 ${hasWarehouse ? t('removeWarehouse') : t('setWarehouse')}
        </button>
      </div>
      <div class="popup-helptext">${t('selectWorkshops')}</div>
      <div class="popup-chip-grid port-workshop-chips"></div>
    </div>`;

  // Warehouse toggle
  container.querySelector('.port-warehouse-btn').addEventListener('click', () => {
    togglePortWarehouse(port);
  });

  // Workshop chips
  const chipContainer = container.querySelector('.port-workshop-chips');
  PORT_WORKSHOPS.forEach(ws => {
    const chip = document.createElement('button');
    const isActive = workshops.includes(ws);
    chip.type = 'button';
    chip.className = 'workshop-chip' + (isActive ? ' active' : '');
    chip.textContent = t(ws);
    chip.addEventListener('click', () => {
      togglePortWorkshop(port, ws);
    });
    chipContainer.appendChild(chip);
  });

  return container;
}

window.togglePortWarehouse = function (port) {
  let portData = myPorts.find(p => p.name === port.name);
  if (!portData) {
    portData = { name: port.name, x: port.x, y: port.y, hasWarehouse: true, workshops: [] };
    myPorts.push(portData);
  } else {
    portData.hasWarehouse = !portData.hasWarehouse;
  }
  if (!portData.hasWarehouse && portData.workshops.length === 0) {
    myPorts = myPorts.filter(p => p.name !== port.name);
  }
  localStorage.setItem('wosb-my-ports', JSON.stringify(myPorts));
  autoExpandPersonalPOIs();
  refreshPOIStyles();
  showToast(portData.hasWarehouse
    ? tf('warehouseSetIn', { name: portName(port) })
    : tf('warehouseRemovedFrom', { name: portName(port) }),
    portData.hasWarehouse ? 'success' : 'warning');
  const marker = layerGroups.ports.getLayers().find(m => m.portRef === port);
  if (marker) { marker.closePopup(); setTimeout(() => marker.openPopup(), 50); }
};
window.togglePortWorkshop = function (port, ws) {
  let portData = myPorts.find(p => p.name === port.name);
  if (!portData) {
    portData = { name: port.name, x: port.x, y: port.y, hasWarehouse: false, workshops: [ws] };
    myPorts.push(portData);
  } else {
    const idx = portData.workshops.indexOf(ws);
    if (idx !== -1) {
      portData.workshops.splice(idx, 1);
    } else {
      if (portData.workshops.length >= 2) {
        showError(t('maxPortWorkshops'));
        return;
      }
      portData.workshops.push(ws);
    }
  }
  if (!portData.hasWarehouse && portData.workshops.length === 0) {
    myPorts = myPorts.filter(p => p.name !== port.name);
  }
  localStorage.setItem('wosb-my-ports', JSON.stringify(myPorts));
  autoExpandPersonalPOIs();
  refreshPOIStyles();
  showToast(t('portWorkshopUpdated'), 'success');
  const marker = layerGroups.ports.getLayers().find(m => m.portRef === port);
  if (marker) { marker.closePopup(); setTimeout(() => marker.openPopup(), 50); }
};
function createProductionPopup(prod) {
  const isPrintshop = prod.type === 'printshop';
  const markerData = (isPrintshop ? myPrintshops : myMines).find(m => m.id === prod.id);
  const isMine = !!markerData;
  const typeArg = isPrintshop ? 'printshop' : 'mine';
  const actionClass = isPrintshop ? 'action-printshop' : 'action-mine';
  const typeLabel = t(prod.type);

  const container = document.createElement('div');
  container.className = 'popup-content';
  container.innerHTML = `
    <div class="popup-title">${typeLabel} ${prod.id}</div>
    <div class="popup-row"><span>${t('type')}</span><span class="popup-value">${typeLabel}</span></div>
    <div class="popup-row"><span>${t('position')}</span><span class="popup-value">${prod.x}, ${prod.y}</span></div>
    ${prod.outsideMap ? `<div class="popup-tag tag-outside">${t('outsideMap')}</div>` : ''}
    <div class="popup-section">
      <div class="popup-helptext">${t(isMine ? 'personalTrackingActiveHint' : 'personalTrackingHint')}</div>
      <div class="popup-actions">
        <button type="button" class="popup-action-btn ${isMine ? 'action-danger' : actionClass} production-track-btn">
          ${isMine ? `✖ ${t('unmarkMyIsland')}` : `⚒️ ${t('markAsMyIsland')}`}
        </button>
      </div>
    </div>`;

  container.querySelector('.production-track-btn')?.addEventListener('click', () => {
    if (isMine) {
      unmarkMyPOI(typeArg, prod.id);
    } else {
      markMyPOI(typeArg, prod.id, prod.x, prod.y);
    }
  });

  return container;
}

function createIslandPopup(island) {
  const markerData = myIslands.find(m => m.id === island.id);
  const isMine = !!markerData;
  const zoneDetails = inferIslandZoneDetails(island.x, island.y);
  const zoneName = markerData?.zoneName || zoneDetails.zoneName;
  const nearestPort = zoneDetails.nearestPort;
  let titleName = t('personalIsland') + ' ' + island.id;
  if (isMine && markerData.customName) titleName = markerData.customName;

  const container = document.createElement('div');
  container.className = 'popup-content';

  let actionsHtml = '';
  if (isMine) {
    actionsHtml = `
      <button type="button" class="popup-action-btn action-warning island-rename-btn">
        ✏️ ${t('rename')}
      </button>
      <button type="button" class="popup-action-btn action-danger island-unmark-btn">
        ✖ ${t('unmarkMyIsland')}
      </button>`;
  } else {
    actionsHtml = `
      <button type="button" class="popup-action-btn action-island island-mark-btn">
        🏝 ${t('markAsMyIsland')}
      </button>`;
  }

  let configHtml = '';
  if (isMine) {
    const workshopOptions = getIslandWorkshopOptions(zoneName, markerData.workshop);
    const productionOptions = getIslandProductionOptions(zoneName, markerData.production);
    const wsOptions = workshopOptions.map(ws =>
      `<option value="${ws}" ${markerData.workshop === ws ? 'selected' : ''}>${t(ws)}</option>`
    ).join('');
    const prodOptions = productionOptions.map(p =>
      `<option value="${p}" ${markerData.production === p ? 'selected' : ''}>${t(p)}</option>`
    ).join('');
    const workshopNames = workshopOptions.map(ws => t(ws)).join(', ');
    const productionNames = productionOptions.map(p => t(p)).join(', ');

    configHtml = `
    <div class="popup-section">
      <div class="popup-helptext">${t('knownIslandWorkshops')} (${tf('workshopZoneHint', { zone: zoneName || t('unknownZone') })}): ${workshopNames}</div>
      <div class="popup-helptext">${t('knownIslandProductions')}: ${productionNames}</div>
      <div class="popup-config-grid">
        <div class="popup-config-row">
          <span class="popup-config-label">🔧 ${t('workshop')}:</span>
          <select class="island-workshop-select popup-select">
            <option value="">${t('none')}</option>
            ${wsOptions}
          </select>
        </div>
        <div class="popup-config-row">
          <span class="popup-config-label">🏭 ${t('productionLabel')}:</span>
          <select class="island-production-select popup-select">
            <option value="">${t('none')}</option>
            ${prodOptions}
          </select>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = `
    <div class="popup-title">${titleName}</div>
    <div class="popup-row"><span>${t('zone')}</span><span class="popup-value">${zoneName || t('unknownZone')}</span></div>
    <div class="popup-row"><span>${t('nearestPort')}</span><span class="popup-value">${nearestPort ? portName(nearestPort) : '-'}</span></div>
    <div class="popup-row"><span>${t('position')}</span><span class="popup-value">${island.x}, ${island.y}</span></div>
    <div class="popup-actions">${actionsHtml}</div>
    ${configHtml}`;

  if (isMine) {
    container.querySelector('.island-rename-btn')?.addEventListener('click', () => {
      markMyPOI('island', island.id, island.x, island.y);
    });
    container.querySelector('.island-unmark-btn')?.addEventListener('click', () => {
      unmarkMyPOI('island', island.id);
    });
    container.querySelector('.island-workshop-select')?.addEventListener('change', (e) => {
      markerData.workshop = e.target.value || null;
      persistMyIslands();
      refreshPOIStyles();
      showToast(e.target.value
        ? tf('workshopSelected', { name: t(e.target.value) })
        : t('workshopRemoved'),
        e.target.value ? 'success' : 'warning');
    });
    container.querySelector('.island-production-select')?.addEventListener('change', (e) => {
      markerData.production = e.target.value || null;
      persistMyIslands();
      refreshPOIStyles();
      showToast(e.target.value
        ? tf('productionSelected', { name: t(e.target.value) })
        : t('productionRemoved'),
        e.target.value ? 'success' : 'warning');
    });
  } else {
    container.querySelector('.island-mark-btn')?.addEventListener('click', () => {
      markMyPOI('island', island.id, island.x, island.y);
    });
  }

  return container;
}
// =============================================================================
// PERSONAL TRACKING (Islands & Mines)
// =============================================================================
function initPersonalState() {
  const savedIslands = localStorage.getItem('wosb-my-islands');
  if (savedIslands) {
    try { myIslands = JSON.parse(savedIslands); } catch (e) { myIslands = []; }
  } else {
    const old = localStorage.getItem('wosb-my-island');
    if (old) {
      try { myIslands = [JSON.parse(old)]; } catch (e) { myIslands = []; }
    }
  }
  myIslands = (Array.isArray(myIslands) ? myIslands : []).map(syncIslandMetadata);
  persistMyIslands();

  const savedMines = localStorage.getItem('wosb-my-mines');
  if (savedMines) {
    try { myMines = JSON.parse(savedMines); } catch (e) { myMines = []; }
  }
  myMines = Array.isArray(myMines) ? myMines : [];

  const savedPrintshops = localStorage.getItem('wosb-my-printshops');
  if (savedPrintshops) {
    try { myPrintshops = JSON.parse(savedPrintshops); } catch (e) { myPrintshops = []; }
  }
  myPrintshops = Array.isArray(myPrintshops) ? myPrintshops : [];

  const savedPorts = localStorage.getItem('wosb-my-ports');
  if (savedPorts) {
    try { myPorts = JSON.parse(savedPorts); } catch (e) { myPorts = []; }
  }
  myPorts = (Array.isArray(myPorts) ? myPorts : []).map(port => ({
    ...port,
    hasWarehouse: Boolean(port.hasWarehouse),
    workshops: Array.isArray(port.workshops) ? port.workshops : []
  }));

  loadPersonalListFilters();
}
function autoExpandPersonalPOIs() {
  const toggle = document.getElementById('toggle-myisland');
  if (toggle && !toggle.classList.contains('active')) {
    toggle.classList.add('active');
    saveUrlState();
  }
  const header = document.getElementById('personal-poi-header');
  if (header && !header.classList.contains('expanded')) {
    header.classList.add('expanded');
    const content = header.nextElementSibling;
    if (content) content.classList.add('expanded');
  }
}

window.showToast = function (msg, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', warning: '⚠️', error: '❌', info: '🌐' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = (icons[type] || '') + ' ' + msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

window.showError = function (msg) { showToast(msg, 'error'); };

window.markMyPOI = function (type, id, x, y) {
  const isIsland = type === 'island';
  const isPrintshop = type === 'printshop';
  const list = isIsland ? myIslands : (isPrintshop ? myPrintshops : myMines);
  const maxLimit = isIsland ? 3 : (isPrintshop ? 99 : 8);
  const storageKey = isIsland ? 'wosb-my-islands' : (isPrintshop ? 'wosb-my-printshops' : 'wosb-my-mines');
  const limitKey = isIsland ? 'limitReachedIslands' : (isPrintshop ? 'limitReachedPrintshops' : 'limitReachedMines');

  const existingIndex = list.findIndex(m => m.id === id);
  if (existingIndex === -1 && list.length >= maxLimit) {
    showError(tf(limitKey, { count: maxLimit }));
    return;
  }

  if (!isIsland) {
    if (existingIndex !== -1) return;
    list.push({ id, x, y, customName: null });
    localStorage.setItem(storageKey, JSON.stringify(list));
    autoExpandPersonalPOIs();
    refreshPOIStyles();
    const typeLabel = isPrintshop ? t('printshop') : t(type);
    showToast(tf('markedAsMine', { name: typeLabel }), 'success');
    map.closePopup();
    return;
  }

  const dialog = document.getElementById('island-dialog');
  const backdrop = document.getElementById('modal-backdrop');
  const input = document.getElementById('island-label-input');
  const title = document.getElementById('island-dialog-title');
  const cancelBtn = document.getElementById('island-cancel');
  const confirmBtn = document.getElementById('island-confirm');

  if (!dialog || !backdrop || !input || !cancelBtn || !confirmBtn || !title) return;

  title.textContent = t('nameYourIsland');
  input.placeholder = t('islandNamePlaceholder');
  const defaultName = existingIndex !== -1 ? list[existingIndex].customName : t('defaultPersonalMarker');
  input.value = defaultName;

  backdrop.classList.add('visible');
  dialog.classList.add('visible');
  input.focus();

  const cleanup = () => {
    backdrop.classList.remove('visible');
    dialog.classList.remove('visible');
    input.onkeydown = null;
    backdrop.onclick = null;
  };

  const submitHandler = () => {
    const customName = input.value.trim() || defaultName;
    cleanup();

    if (existingIndex !== -1) {
      list[existingIndex].customName = customName;
      list[existingIndex] = syncIslandMetadata(list[existingIndex]);
    } else {
      list.push(syncIslandMetadata({ id, x, y, customName }));
    }

    persistMyIslands();
    autoExpandPersonalPOIs();
    refreshPOIStyles();
    showToast(tf('markerSaved', { name: customName }), 'success');
    map.closePopup();
  };

  cancelBtn.onclick = () => { cleanup(); map.closePopup(); };
  confirmBtn.onclick = submitHandler;
  backdrop.onclick = () => { cleanup(); map.closePopup(); };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') submitHandler();
    if (e.key === 'Escape') cancelBtn.click();
  };
};

window.unmarkMyPOI = function (type, id) {
  const isIsland = type === 'island';
  const isPrintshop = type === 'printshop';
  let list = isIsland ? myIslands : (isPrintshop ? myPrintshops : myMines);
  const storageKey = isIsland ? 'wosb-my-islands' : (isPrintshop ? 'wosb-my-printshops' : 'wosb-my-mines');

  list = list.filter(m => m.id !== id);
  if (isIsland) myIslands = list; else if (isPrintshop) myPrintshops = list; else myMines = list;

  if (isIsland) persistMyIslands();
  else localStorage.setItem(storageKey, JSON.stringify(list));

  refreshPOIStyles();
  showToast(t('markRemoved'), 'warning');
  map.closePopup();
};
function refreshPOIStyles() {
  const toggleMyIsland = document.getElementById('toggle-myisland');
  if (!toggleMyIsland) return;
  const showPersonal = toggleMyIsland.classList.contains('active');
  const showAllPorts = document.getElementById('toggle-ports').classList.contains('active');
  const showAllIslands = document.getElementById('toggle-islands').classList.contains('active');
  const showAllProduction = document.getElementById('toggle-production').classList.contains('active');
  const showRadius = document.getElementById('toggle-radius').classList.contains('active');
  const showCustom = document.getElementById('toggle-custom')?.classList.contains('active');

  if (layerGroups.ports) {
    layerGroups.ports.eachLayer(marker => {
      const port = marker.portRef;
      const portData = port ? myPorts.find(entry => entry.name === port.name) : null;
      const isMine = !!portData;
      const shouldShow = showAllPorts || (showPersonal && isMine);

      if (shouldShow) marker.addTo(map);
      else map.removeLayer(marker);

      if (showPersonal && isMine) marker._icon?.classList.add('my-port-marker');
      else marker._icon?.classList.remove('my-port-marker');
    });
  }

  pois.filter(p => p.type === 'island').forEach(island => {
    const marker = window.poiMarkers['island_' + island.id];
    if (!marker) return;
    const myData = myIslands.find(entry => entry.id === island.id);
    const isMine = !!myData;
    const shouldShow = showAllIslands || (showPersonal && isMine);

    if (shouldShow) marker.addTo(map);
    else map.removeLayer(marker);

    if (showPersonal && isMine) {
      marker._icon?.classList.add('my-island-marker');
      if (myData.customName) {
        marker.unbindTooltip();
        marker.bindTooltip(myData.customName, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 22],
          className: 'port-label-tooltip',
          pane: 'portLabels'
        });
      } else {
        marker.unbindTooltip();
      }
    } else {
      marker._icon?.classList.remove('my-island-marker');
      marker.unbindTooltip();
    }
  });

  pois.filter(p => PRODUCTION_TYPES.includes(p.type)).forEach(prod => {
    const marker = window.poiMarkers['mine_' + prod.id];
    if (!marker) return;
    const isPrintshop = prod.type === 'printshop';
    const isMine = isPrintshop ? myPrintshops.some(entry => entry.id === prod.id) : myMines.some(entry => entry.id === prod.id);
    const shouldShow = showAllProduction || (showPersonal && isMine);

    if (shouldShow) marker.addTo(map);
    else map.removeLayer(marker);

    const useOutsideStyle = Boolean(prod.outsideMap && hasOutsidePoiVariant(prod.type));
    marker.setZIndexOffset(isMine ? 480 : 0);

    if (showPersonal && isMine) {
      if (useOutsideStyle) marker._icon?.classList.add('my-outside-production-marker');
      else marker._icon?.classList.remove('my-outside-production-marker');
      if (isPrintshop) marker._icon?.classList.add('my-printshop-marker');
      else marker._icon?.classList.add('my-mine-marker');
    } else {
      marker._icon?.classList.remove('my-outside-production-marker');
      marker._icon?.classList.remove('my-mine-marker');
      marker._icon?.classList.remove('my-printshop-marker');
    }
  });

  Object.values(myIslandDecorationLayers).forEach(entry => {
    if (Array.isArray(entry)) entry.forEach(layer => map.removeLayer(layer));
    else if (entry) map.removeLayer(entry);
  });
  myIslandDecorationLayers = {};

  if (showPersonal) {
    myIslands.forEach(island => {
      const pos = px(island.x, island.y);
      const layers = createPersonalHighlightLayers(pos, 'island');
      const badges = getIslandStatusBadges(island, getMapStatusLabel, { context: 'map' });
      const badgeMarker = createStatusBadgeMarker(pos, badges, { variant: 'island', forceInline: true, maxPerRow: 1 });
      if (badgeMarker) layers.push(badgeMarker);
      layers.forEach(layer => layer.addTo(map));
      if (layers.length) myIslandDecorationLayers[island.id] = layers;
    });
  }

  Object.values(myIslandRadiusCircles).forEach(entry => {
    if (Array.isArray(entry)) entry.forEach(layer => map.removeLayer(layer));
    else map.removeLayer(entry);
  });
  myIslandRadiusCircles = {};

  if (showPersonal && showRadius) {
    myIslands.forEach(island => {
      const pos = px(island.x, island.y);
      const radiusPx = ISLAND_RADIUS_NM * PIXELS_PER_NM;
      const ring = L.circle(pos, {
        radius: radiusPx, color: '#4ecdc4', weight: 4, fillColor: '#4ecdc4', fillOpacity: 0.05, pane: 'radiusPane'
      }).addTo(map);
      myIslandRadiusCircles[island.id] = ring;
    });
  }

  Object.values(myPortDecorationLayers).forEach(entry => {
    if (Array.isArray(entry)) entry.forEach(layer => map.removeLayer(layer));
    else if (entry) map.removeLayer(entry);
  });
  myPortDecorationLayers = {};

  if (showPersonal) {
    myPorts.forEach(portEntry => {
      const pos = px(portEntry.x, portEntry.y);
      const layers = createPersonalHighlightLayers(pos, 'port');
      const badges = getPortStatusBadges(portEntry, getMapStatusLabel, { context: 'map' });
      const badgeMarker = createStatusBadgeMarker(pos, badges, { variant: 'port', forceInline: true, maxPerRow: 1 });
      if (badgeMarker) layers.push(badgeMarker);
      layers.forEach(layer => layer.addTo(map));
      if (layers.length) myPortDecorationLayers[portEntry.name] = layers;
    });
  }

  Object.values(myProductionDecorationLayers).forEach(entry => {
    if (Array.isArray(entry)) entry.forEach(layer => map.removeLayer(layer));
    else if (entry) map.removeLayer(entry);
  });
  myProductionDecorationLayers = {};

  if (showPersonal) {
    myMines.forEach(mine => {
      const minePoi = pois.find(p => p.id === mine.id && PRODUCTION_TYPES.includes(p.type));
      const useOutsideStyle = Boolean(minePoi?.outsideMap && hasOutsidePoiVariant(minePoi.type));
      const kind = useOutsideStyle ? 'outsideProduction' : 'resource';
      const layers = createPersonalHighlightLayers(px(mine.x, mine.y), kind);
      layers.forEach(layer => layer.addTo(map));
      if (layers.length) myProductionDecorationLayers['mine_' + mine.id] = layers;
    });
    myPrintshops.forEach(printshop => {
      const printshopPoi = pois.find(p => p.id === printshop.id && p.type === 'printshop');
      const useOutsideStyle = Boolean(printshopPoi?.outsideMap && hasOutsidePoiVariant(printshopPoi.type));
      const kind = useOutsideStyle ? 'outsideProduction' : 'printshop';
      const layers = createPersonalHighlightLayers(px(printshop.x, printshop.y), kind);
      layers.forEach(layer => layer.addTo(map));
      if (layers.length) myProductionDecorationLayers['printshop_' + printshop.id] = layers;
    });
  }

  if (customLayerGroup) {
    if (showPersonal && showCustom) customLayerGroup.addTo(map);
    else map.removeLayer(customLayerGroup);
  }

  buildMeasureSnapTargets();
  updatePersonalPOIList();
}

function updatePersonalPOIList() {
  const container = document.getElementById('personal-poi-list');
  if (!container) return;
  if (!personalListFilters.size) loadPersonalListFilters();

  const items = [];

  myIslands.forEach(island => {
    const inferred = inferIslandZoneDetails(island.x, island.y);
    const zoneName = island.zoneName || inferred.zoneName;
    items.push({
      category: 'islands',
      sortOrder: 0,
      name: island.customName || t('personalIsland'),
      icon: 'island',
      coordsLabel: `${island.x}, ${island.y}`,
      metaParts: zoneName ? [zoneName] : [],
      chips: getIslandStatusBadges(island, t, { context: 'sidebar' }),
      clickHandler: `map.setView(px(${island.x}, ${island.y}), 2, { animate: true })`
    });
  });

  myMines.forEach(mine => {
    const typeKey = pois.find(p => p.id === mine.id && PRODUCTION_TYPES.includes(p.type))?.type || 'coal';
    const zoneName = inferIslandZoneDetails(mine.x, mine.y).zoneName;
    items.push({
      category: 'resources',
      sortOrder: 1,
      name: t(typeKey),
      icon: typeKey,
      coordsLabel: `${mine.x}, ${mine.y}`,
      metaParts: zoneName ? [zoneName, t('searchTypeProduction')] : [t('searchTypeProduction')],
      chips: [],
      clickHandler: `map.setView(px(${mine.x}, ${mine.y}), 2, { animate: true })`
    });
  });

  myPrintshops.forEach(printshop => {
    const zoneName = inferIslandZoneDetails(printshop.x, printshop.y).zoneName;
    items.push({
      category: 'resources',
      sortOrder: 2,
      name: t('printshop'),
      icon: 'printshop',
      coordsLabel: `${printshop.x}, ${printshop.y}`,
      metaParts: zoneName ? [zoneName, t('searchTypeProduction')] : [t('searchTypeProduction')],
      chips: [],
      clickHandler: `map.setView(px(${printshop.x}, ${printshop.y}), 2, { animate: true })`
    });
  });

  myPorts.forEach(portEntry => {
    const port = ports.find(candidate => candidate.name === portEntry.name);
    const metaParts = [];
    const zoneName = port ? getPortZoneName(port) : null;
    if (zoneName) metaParts.push(zoneName);
    if (port) metaParts.push(t(PORT_TYPE_NAMES_KEY[port.type]));
    if (portEntry.hasWarehouse) metaParts.push(t('warehouse'));
    items.push({
      category: 'ports',
      sortOrder: 3,
      name: port ? portName(port) : portEntry.name,
      icon: port?.type || 'n',
      coordsLabel: `${portEntry.x}, ${portEntry.y}`,
      metaParts,
      chips: getPortStatusBadges(portEntry, t, { context: 'sidebar' }),
      clickHandler: `map.setView(px(${portEntry.x}, ${portEntry.y}), 2, { animate: true })`
    });
  });

  customMarkers.forEach(marker => {
    items.push({
      category: 'custom',
      sortOrder: 4,
      name: marker.label || t('customMarkerDefault'),
      iconHtml: '<span class="poi-icon-custom">📍</span>',
      coordsLabel: `${Math.round(marker.lng)}, ${Math.round(-marker.lat)}`,
      metaParts: [],
      chips: [{ tone: 'neutral', label: t('customMarkers') }],
      clickHandler: `map.setView([${marker.lat}, ${marker.lng}], 2, { animate: true })`
    });
  });

  items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, currentLang));

  const filterDefs = [
    { key: 'islands', label: t('islands') },
    { key: 'ports', label: t('ports') },
    { key: 'resources', label: t('production') },
    { key: 'custom', label: t('customMarkers') }
  ];
  const counts = Object.fromEntries(filterDefs.map(filter => [filter.key, items.filter(item => item.category === filter.key).length]));
  const visibleItems = items.filter(item => personalListFilters.has(item.category));

  const filtersHtml = `
    <div class="personal-filter-row">
      ${filterDefs.map(filter => `
        <button type="button" class="personal-filter-chip${personalListFilters.has(filter.key) ? ' active' : ''}" data-poi-filter="${filter.key}">
          <span>${escapeHtml(filter.label)}</span>
          <span class="personal-filter-count">${counts[filter.key] || 0}</span>
        </button>
      `).join('')}
    </div>
  `;

  const legendHtml = '';


  let listHtml = visibleItems.map(item => {
    const iconMarkup = item.iconHtml || `<img src="assets/${item.icon}.png" class="poi-icon-img" alt="">`;
    const chipsHtml = item.chips?.length
      ? `<div class="poi-chip-row">${item.chips.map(chip => `<span class="poi-chip poi-chip-${chip.tone}">${escapeHtml(chip.label)}</span>`).join('')}</div>`
      : '';
    const metaHtml = item.metaParts?.length
      ? `<div class="poi-meta">${item.metaParts.map(part => escapeHtml(part)).join(' · ')}</div>`
      : '';
    return `
    <button type="button" class="personal-poi-item" onclick="${item.clickHandler}" aria-label="${escapeHtml(item.name)}">
      <div class="poi-icon-wrap">${iconMarkup}</div>
      <div class="poi-copy">
        <div class="poi-head">
          <span class="poi-name">${escapeHtml(item.name)}</span>
          <span class="poi-coords">${escapeHtml(item.coordsLabel)}</span>
        </div>
        ${chipsHtml}
        ${metaHtml}
      </div>
    </button>`;
  }).join('');

  if (!listHtml) {
    listHtml = `<div class="personal-poi-empty">${escapeHtml(items.length ? t('noFilteredPersonalMarks') : t('noPersonalMarks'))}</div>`;
  }

  container.innerHTML = `
    <div class="personal-poi-toolbar">
      ${filtersHtml}
      ${legendHtml}
    </div>
    <div class="personal-poi-list-body">${listHtml}</div>
  `;

  container.querySelectorAll('[data-poi-filter]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      togglePersonalListFilter(button.dataset.poiFilter);
    });
  });
}
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  toggle.addEventListener('click', () => {
    isMobile ? sidebar.classList.toggle('mobile-open') : sidebar.classList.toggle('collapsed');
  });

  const layerConfig = [
    { id: 'toggle-ports', layer: 'ports', active: true },
    { id: 'toggle-lighthouses', layer: 'lighthouses', active: true },
    { id: 'toggle-routes', layer: 'routes', active: false },
    { id: 'toggle-distance-routes', layer: 'distance-routes', active: true, storageKey: DISTANCE_ROUTES_VISIBLE_STORAGE_KEY },
    { id: 'toggle-route-animation', layer: 'route-animation', active: true, storageKey: ROUTE_ANIMATION_STORAGE_KEY },
    { id: 'toggle-islands', layer: 'islands', active: true },
    { id: 'toggle-production', layer: 'production', active: true },
    { id: 'toggle-altars', layer: 'altars', active: true },
    { id: 'toggle-forts', layer: 'forts', active: true },
    { id: 'toggle-pvp', layer: 'pvp', active: true },
    { id: 'toggle-custom', layer: 'custom', active: true },
    { id: 'toggle-myisland', layer: 'myisland', active: true },
    { id: 'toggle-radius', layer: 'radius', active: true }
  ];

  layerConfig.forEach(cfg => {
    const el = document.getElementById(cfg.id);
    if (!el) return;
    const isActive = cfg.storageKey
      ? loadBooleanPreference(cfg.storageKey, cfg.active)
      : (el.classList.contains('active') || cfg.active);
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    if (cfg.layer === 'distance-routes') setSavedDistanceRoutesVisible(isActive, { persist: false });
    if (cfg.layer === 'route-animation') setRouteAnimationsEnabled(isActive, { persist: false });
    el.addEventListener('click', () => {
      const nextState = !el.classList.contains('active');
      el.classList.toggle('active', nextState);
      el.setAttribute('aria-pressed', nextState ? 'true' : 'false');
      toggleLayer(cfg.layer, nextState);
      saveUrlState();
    });
  });

  const darkModeBtn = document.getElementById('btn-darkmode');
  darkModeBtn?.setAttribute('aria-pressed', darkModeBtn.classList.contains('active') ? 'true' : 'false');
  darkModeBtn?.addEventListener('click', function () {
    const nextState = !this.classList.contains('active');
    this.classList.toggle('active', nextState);
    this.setAttribute('aria-pressed', nextState ? 'true' : 'false');
    document.getElementById('map').classList.toggle('dark-mode');
    saveUrlState();
  });

  const collapseState = loadCollapseState();
  document.querySelectorAll('.collapsible-header').forEach(header => {
    const saved = collapseState[header.id];
    if (typeof saved === 'boolean') {
      header.classList.toggle('expanded', saved);
      header.nextElementSibling?.classList.toggle('expanded', saved);
    }
    header.setAttribute('aria-expanded', header.classList.contains('expanded') ? 'true' : 'false');
    header.addEventListener('click', () => {
      const nextState = !header.classList.contains('expanded');
      header.classList.toggle('expanded', nextState);
      header.setAttribute('aria-expanded', nextState ? 'true' : 'false');
      const content = header.nextElementSibling;
      if (content) content.classList.toggle('expanded', nextState);
      collapseState[header.id] = nextState;
      saveCollapseState(collapseState);
      updateCollapseAllLabel();
    });
  });

  const collapseAllBtn = document.getElementById('collapse-all-toggle');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', () => {
      const headers = document.querySelectorAll('.collapsible-header');
      const anyExpanded = [...headers].some(h => h.classList.contains('expanded'));
      headers.forEach(h => {
        const nextState = !anyExpanded;
        h.classList.toggle('expanded', nextState);
        h.setAttribute('aria-expanded', nextState ? 'true' : 'false');
        h.nextElementSibling?.classList.toggle('expanded', nextState);
        collapseState[h.id] = nextState;
      });
      saveCollapseState(collapseState);
      updateCollapseAllLabel();
    });
  }

  window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });
}

function updateCollapseAllLabel() {
  const btn = document.getElementById('collapse-all-toggle');
  if (!btn) return;
  const headers = document.querySelectorAll('.collapsible-header');
  const anyExpanded = [...headers].some(h => h.classList.contains('expanded'));
  const label = anyExpanded ? t('collapseAll') : t('expandAll');
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
}
function toggleLayer(layerName, show) {
  switch (layerName) {
    case 'ports':
      show ? layerGroups.ports.addTo(map) : map.removeLayer(layerGroups.ports);
      refreshPOIStyles();
      break;
    case 'lighthouses': show ? layerGroups.lighthouses.addTo(map) : map.removeLayer(layerGroups.lighthouses); break;
    case 'routes':
      if (show) {
        overlayLayers.fastTravel?.addTo(map);
        overlayLayers.fastTravelAnimated.addTo(map);
      } else {
        map.removeLayer(overlayLayers.fastTravelAnimated);
        if (overlayLayers.fastTravel) map.removeLayer(overlayLayers.fastTravel);
      }
      break;
    case 'distance-routes':
      setSavedDistanceRoutesVisible(show);
      break;
    case 'route-animation':
      setRouteAnimationsEnabled(show);
      break;
    case 'altars': show ? layerGroups.altars.addTo(map) : map.removeLayer(layerGroups.altars); break;
    case 'forts': show ? layerGroups.forts.addTo(map) : map.removeLayer(layerGroups.forts); break;
    case 'pvp': show ? overlayLayers.circle.addTo(map) : map.removeLayer(overlayLayers.circle); break;
    case 'custom':
      refreshPOIStyles();
      break;

    // Complex interacting layers completely handled by refreshPOIStyles
    case 'islands':
    case 'production':
    case 'myisland':
    case 'radius':
      refreshPOIStyles();
      break;
  }
}

// =============================================================================
// SEARCH
// =============================================================================
function initSearch() {
  const container = document.getElementById('search-container');
  const trigger = document.getElementById('search-trigger');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!container || !trigger || !input || !results) return;

  const setSearchExpanded = expanded => {
    container.classList.toggle('search-expanded', expanded);
    trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    input.tabIndex = expanded ? 0 : -1;
  };

  const expandSearch = (focusInput = false) => {
    setSearchExpanded(true);
    if (focusInput) requestAnimationFrame(() => input.focus());
  };

  const collapseSearch = ({ clear = false, blur = false } = {}) => {
    if (clear) input.value = '';
    results.classList.remove('visible');
    searchIndex = -1;
    setSearchExpanded(false);
    if (blur) input.blur();
  };

  function ensureToggleActive(toggleId, layerName) {
    const el = document.getElementById(toggleId);
    if (!el || el.classList.contains('active')) return;
    el.classList.add('active');
    toggleLayer(layerName, true);
  }

  function buildSearchItems() {
    const items = [];

    ports.forEach(port => {
      const zoneName = getPortZoneName(port);
      const aliases = [...new Set([...getPortAliases(port), zoneName].filter(Boolean))];
      items.push({
        label: portName(port),
        meta: zoneName || '',
        typeKey: 'searchTypePort',
        x: port.x,
        y: port.y,
        terms: [...aliases, port.name, port.name_de, portName(port)].filter(Boolean),
        reveal: () => {
          ensureToggleActive('toggle-ports', 'ports');
          const marker = layerGroups.ports.getLayers().find(m => m.portRef === port);
          setTimeout(() => marker?.openPopup(), 250);
        }
      });
    });

    pois.filter(p => p.type === 'island').forEach(island => {
      const zoneDetails = inferIslandZoneDetails(island.x, island.y);
      const terms = [
        `Island ${island.id}`,
        `Insel ${island.id}`,
        `${t('personalIsland')} ${island.id}`,
        zoneDetails.zoneName,
        zoneDetails.nearestPort ? portName(zoneDetails.nearestPort) : '',
        zoneDetails.nearestPort?.name || ''
      ].filter(Boolean);
      items.push({
        label: `${t('personalIsland')} ${island.id}`,
        meta: zoneDetails.zoneName || '',
        typeKey: 'searchTypeIsland',
        x: island.x,
        y: island.y,
        terms,
        reveal: () => {
          ensureToggleActive('toggle-islands', 'islands');
          setTimeout(() => window.poiMarkers['island_' + island.id]?.openPopup(), 250);
        }
      });
    });

    pois.filter(p => PRODUCTION_TYPES.includes(p.type)).forEach(prod => {
      const terms = [
        `${prod.type} ${prod.id}`,
        `${t(prod.type)} ${prod.id}`,
        t(prod.type),
        prod.id
      ].filter(Boolean);
      items.push({
        label: `${t(prod.type)} ${prod.id}`,
        meta: '',
        typeKey: 'searchTypeProduction',
        x: prod.x,
        y: prod.y,
        terms,
        reveal: () => {
          ensureToggleActive('toggle-production', 'production');
          setTimeout(() => window.poiMarkers['mine_' + prod.id]?.openPopup(), 250);
        }
      });
    });

    pois.filter(p => p.type === 'altar').forEach(altar => {
      items.push({
        label: `${t('altar')} ${altar.id}`,
        meta: '',
        typeKey: 'searchTypeAltar',
        x: altar.x,
        y: altar.y,
        terms: [`Altar ${altar.id}`, `${t('altar')} ${altar.id}`, altar.id],
        reveal: () => {
          ensureToggleActive('toggle-altars', 'altars');
          setTimeout(() => window.poiMarkers['altar_' + altar.id]?.openPopup(), 250);
        }
      });
    });

    pois.filter(p => p.type === 'fort').forEach(fort => {
      items.push({
        label: `${t('fort')} ${fort.id}`,
        meta: '',
        typeKey: 'searchTypeFort',
        x: fort.x,
        y: fort.y,
        terms: [`Fort ${fort.id}`, `${t('fort')} ${fort.id}`, fort.id],
        reveal: () => {
          ensureToggleActive('toggle-forts', 'forts');
          setTimeout(() => window.poiMarkers['fort_' + fort.id]?.openPopup(), 250);
        }
      });
    });

    return items;
  }

  function activateMatch(match) {
    map.setView(px(match.x, match.y), 2, { animate: true });
    match.reveal?.();
    collapseSearch({ clear: true, blur: true });
    saveUrlState();
  }

  function renderResults(matches) {
    results.innerHTML = matches.map((m, index) => `
      <div class="search-result-item" data-idx="${index}">
        <span class="search-result-type">${t(m.typeKey)}</span>
        <span class="search-result-text">
          <span class="search-result-label">${m.label}</span>
          ${m.meta ? `<span class="search-result-meta">${m.meta}</span>` : ''}
        </span>
      </div>`).join('');
    results.classList.add('visible');
    searchIndex = -1;
    results.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const match = matches[Number(item.dataset.idx)];
        activateMatch(match);
      });
    });
  }

  trigger.addEventListener('click', event => {
    event.preventDefault();
    if (container.classList.contains('search-expanded') && !input.value.trim() && document.activeElement === input) {
      collapseSearch({ blur: true });
      return;
    }
    expandSearch(true);
  });

  input.addEventListener('focus', () => expandSearch());

  input.addEventListener('input', () => {
    const query = normalizeSearchText(input.value.trim());
    expandSearch();
    if (!query) {
      results.classList.remove('visible');
      searchIndex = -1;
      return;
    }
    const matches = buildSearchItems().filter(item =>
      item.terms.some(term => normalizeSearchText(term).includes(query))
    ).slice(0, 10);
    if (!matches.length) {
      results.classList.remove('visible');
      searchIndex = -1;
      return;
    }
    renderResults(matches);
  });

  input.addEventListener('keydown', e => {
    const items = results.querySelectorAll('.search-result-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      searchIndex = Math.min(searchIndex + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('selected', i === searchIndex));
      items[searchIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      searchIndex = Math.max(searchIndex - 1, 0);
      items.forEach((it, i) => it.classList.toggle('selected', i === searchIndex));
      items[searchIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (searchIndex >= 0 && items[searchIndex]) {
        items[searchIndex].click();
      } else if (items.length === 1) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      collapseSearch({ clear: true, blur: true });
    }
  });

  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || e.target.closest('.search-container')) return;
    results.classList.remove('visible');
    searchIndex = -1;
    if (!input.value.trim()) collapseSearch();
  });

  setSearchExpanded(false);
}
// =============================================================================
// CUSTOM MARKERS
// =============================================================================
function initCustomMarkers() {
  customLayerGroup = L.layerGroup();
  const saved = localStorage.getItem('wosb-custom-markers');
  if (saved) {
    try { customMarkers = JSON.parse(saved); customMarkers.forEach(cm => addCustomMarkerToMap(cm)); } catch (e) { customMarkers = []; }
  }
  map.on('contextmenu', e => showContextMenu(e.originalEvent.pageX, e.originalEvent.pageY, resolveMeasureLatLng(e.latlng))); 
}

function addCustomMarkerToMap(data) {
  const label = data.label || t('customMarkerDefault');
  const safeLabel = escapeHtml(label);
  const icon = L.divIcon({
    className: '', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12],
    html: `<div style="width:24px;height:24px;background:var(--color-custom,#22d3ee);border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;">📍</div>`
  });
  const marker = L.marker([data.lat, data.lng], { icon });
  window.poiMarkers['custom_' + data.id] = marker;

  marker.bindTooltip('<b>' + safeLabel + '</b><br>X: ' + Math.round(data.lng) + ' | Y: ' + Math.round(-data.lat), {
    direction: 'top', offset: [0, -12], className: 'custom-marker-tooltip', opacity: 0.9
  });

  marker.bindPopup(() => {
    const container = document.createElement('div');
    container.className = 'popup-content';
    container.innerHTML = `
      <div class="popup-title">${safeLabel}</div>
      <div class="popup-row"><span>${t('type')}</span><span class="popup-value">${t('customMarkerType')}</span></div>
      <div class="popup-row"><span>${t('position')}</span><span class="popup-value">${Math.round(data.lng)}, ${Math.round(-data.lat)}</span></div>
      <div class="popup-section">
        <div class="popup-helptext">${t('customMarkerHint')}</div>
        <div class="popup-actions">
          <button type="button" class="popup-action-btn action-danger custom-marker-delete-btn">🗑 ${t('delete')}</button>
        </div>
      </div>`;
    container.querySelector('.custom-marker-delete-btn')?.addEventListener('click', () => deleteCustomMarker(data.id));
    return container;
  });
  marker.customId = data.id;
  customLayerGroup.addLayer(marker);
}

function showMarkerDialog(latlng) {
  const dialog = document.getElementById('marker-dialog');
  const backdrop = document.getElementById('modal-backdrop');
  const input = document.getElementById('marker-label-input');
  dialog.classList.add('visible');
  backdrop.classList.add('visible');
  input.value = '';
  input.focus();

  const onConfirm = () => {
    const label = input.value.trim() || t('customMarkerDefault');
    const data = { id: Date.now(), lat: latlng.lat, lng: latlng.lng, label };
    customMarkers.push(data);
    addCustomMarkerToMap(data);
    saveCustomMarkers();
    autoExpandPersonalPOIs();
    refreshPOIStyles();
    showToast(tf('customMarkerAdded', { name: label }), 'success');
    closeDialog();
  };
  const closeDialog = () => {
    dialog.classList.remove('visible');
    backdrop.classList.remove('visible');
    confirm.removeEventListener('click', onConfirm);
    cancel.removeEventListener('click', closeDialog);
    input.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = e => {
    if (e.key === 'Enter') onConfirm();
    if (e.key === 'Escape') closeDialog();
  };

  const confirm = document.getElementById('marker-confirm');
  const cancel = document.getElementById('marker-cancel');
  confirm.addEventListener('click', onConfirm);
  cancel.addEventListener('click', closeDialog);
  input.addEventListener('keydown', onKeydown);
  backdrop.addEventListener('click', closeDialog, { once: true });
}

window.deleteCustomMarker = function (id) {
  const removed = customMarkers.find(m => m.id === id);
  customMarkers = customMarkers.filter(m => m.id !== id);
  delete window.poiMarkers['custom_' + id];
  saveCustomMarkers();
  customLayerGroup.eachLayer(layer => { if (layer.customId === id) customLayerGroup.removeLayer(layer); });
  refreshPOIStyles();
  showToast(tf('customMarkerDeleted', { name: removed?.label || t('customMarkerDefault') }), 'warning');
};

function saveCustomMarkers() { localStorage.setItem('wosb-custom-markers', JSON.stringify(customMarkers)); }

function hideContextMenu(options = {}) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.classList.remove('visible');
  menu.innerHTML = '';
  contextMenuItems = [];
  contextMenuActiveIndex = -1;
  contextMenuLatLng = null;
  if (options.restoreFocus) map?.getContainer()?.focus?.();
}

function setContextMenuActiveItem(index) {
  if (!contextMenuItems.length) return;
  const normalizedIndex = (index + contextMenuItems.length) % contextMenuItems.length;
  contextMenuItems.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === normalizedIndex));
  contextMenuActiveIndex = normalizedIndex;
  contextMenuItems[normalizedIndex].focus();
}

function handleContextMenuAction(action) {
  const latlng = contextMenuLatLng;
  if (!latlng) {
    hideContextMenu({ restoreFocus: true });
    return;
  }

  if (action === 'add-marker') {
    hideContextMenu();
    showMarkerDialog(latlng);
    return;
  }

  if (action === 'copy-coords') {
    const coords = `${Math.round(latlng.lng)}, ${Math.round(-latlng.lat)}`;
    hideContextMenu();
    copyCoordsToClipboard(coords);
  }
}

function copyCoordsToClipboard(coordsText) {
  const toastSuccess = () => showToast(tf('copyCoordsSuccess', { coords: coordsText }), 'info');
  const fallbackCopy = () => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = coordsText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) { toastSuccess(); return; }
      throw new Error('execCommand copy returned false');
    } catch (error) {
      console.error('Clipboard copy failed', error);
      showError('Unable to copy coordinates');
    }
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(coordsText).then(toastSuccess).catch(() => fallbackCopy());
  } else {
    fallbackCopy();
  }
}

function initContextMenu() {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  menu.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('.context-item') : null;
    if (!button) return;
    handleContextMenuAction(button.dataset.action);
  });

  menu.addEventListener('keydown', event => {
    if (!contextMenuItems.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setContextMenuActiveItem(contextMenuActiveIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setContextMenuActiveItem(contextMenuActiveIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setContextMenuActiveItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setContextMenuActiveItem(contextMenuItems.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideContextMenu({ restoreFocus: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      contextMenuItems[contextMenuActiveIndex]?.click();
    }
  });

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#context-menu')) {
      hideContextMenu();
    }
  });

  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#map')) {
      hideContextMenu();
    }
  });

  window.addEventListener('blur', () => hideContextMenu());
  window.addEventListener('resize', () => hideContextMenu());
}

function showContextMenu(x, y, latlng) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  contextMenuLatLng = latlng;
  menu.innerHTML = `
    <button type="button" class="context-item" data-action="add-marker" role="menuitem">
      <span class="context-item-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 21s-5-4.35-5-10a5 5 0 1 1 10 0c0 5.65-5 10-5 10Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="11" r="1.8" fill="currentColor"/>
        </svg>
      </span>
      <span class="context-item-label">${t('addMarkerCtx')}</span>
    </button>
    <button type="button" class="context-item" data-action="copy-coords" role="menuitem">
      <span class="context-item-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="context-item-label">${t('copyCoords')}</span>
    </button>
  `;
  menu.classList.add('visible');
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';

  contextMenuItems = [...menu.querySelectorAll('.context-item')];
  contextMenuActiveIndex = contextMenuItems.length ? 0 : -1;

  const padding = 12;
  const maxLeft = Math.max(padding, window.innerWidth - menu.offsetWidth - padding);
  const maxTop = Math.max(padding, window.innerHeight - menu.offsetHeight - padding);
  menu.style.left = `${Math.min(Math.max(padding, x), maxLeft)}px`;
  menu.style.top = `${Math.min(Math.max(padding, y), maxTop)}px`;

  if (contextMenuItems[0]) {
    requestAnimationFrame(() => setContextMenuActiveItem(0));
  }
}
// =============================================================================
// DISTANCE TOOL — Ctrl-hold to measure in Seemeilen
// =============================================================================
function initDistanceTool() {
  let ctrlHeld = false;
  let tempLine = null;
  let tempLabel = null;
  let lastCursorLatLng = null;
  let pointerInsideMap = false;

  buildMeasureSnapTargets();
  loadSavedDistanceRoutes();

  clearDistancePreview = () => {
    if (tempLine) { map.removeLayer(tempLine); tempLine = null; }
    if (tempLabel) { map.removeLayer(tempLabel); tempLabel = null; }
    clearActiveSnapMarker();
  };

  const setDistanceInfoValue = (value = null) => {
    const info = document.getElementById('distance-info');
    if (!info) return;
    if (value == null) {
      info.classList.remove('visible');
      return;
    }
    info.querySelector('.dist-value').textContent = value;
    info.classList.add('visible');
  };

  const redrawActiveDistanceLayers = () => {
    activeDistanceLayers.forEach(layer => map.removeLayer(layer));
    activeDistanceLayers = [];

    let totalPx = 0;
    for (let i = 0; i < activeDistancePoints.length; i++) {
      const p = activeDistancePoints[i];
      const dot = L.circleMarker(p, { radius: 5, color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 1, weight: 0 }).addTo(map);
      activeDistanceLayers.push(dot);

      if (i > 0) {
        const prev = activeDistancePoints[i - 1];
        totalPx += getMeasurePointDistance(prev, p);

        const line = ensureAnimatedRoute(L.polyline([prev, p], { color: '#f43f5e', weight: 2, dashArray: '6, 4', className: 'animated-route' }).addTo(map));
        activeDistanceLayers.push(line);

        const totalNm = totalPx / PIXELS_PER_NM;
        const displayValue = Math.round(totalNm * 1000);
        const label = L.marker(getMeasureLabelLatLng(prev, p), {
          icon: createDistanceLabelIcon(displayValue),
          interactive: false
        }).addTo(map);
        activeDistanceLayers.push(label);

        if (i === activeDistancePoints.length - 1) setDistanceInfoValue(displayValue);
      }
    }

    if (activeDistancePoints.length <= 1) setDistanceInfoValue(null);
  };

  const addActiveDistancePoint = latlng => {
    activeDistancePoints.push(resolveMeasureLatLng(latlng));
    redrawActiveDistanceLayers();
  };

  const commitActiveRoute = () => {
    if (activeDistancePoints.length > 1) {
      const route = { id: Date.now(), points: [...activeDistancePoints], layerGroup: L.layerGroup() };
      distanceRoutes.push(route);
      renderSavedRoute(route);
      if (savedDistanceRoutesVisible) route.layerGroup.addTo(map);
      saveDistanceRoutes();
    }
    activeDistanceLayers.forEach(layer => map.removeLayer(layer));
    activeDistanceLayers = [];
    activeDistancePoints = [];
    setDistanceInfoValue(null);
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Control' && !ctrlHeld) {
      ctrlHeld = true;
      clearActiveSnapMarker();
      setSnapCursorMeasureMode(true);
      document.getElementById('map').style.cursor = 'crosshair';
      document.getElementById('map').classList.add('measure-mode');
      if (pointerInsideMap && lastCursorLatLng && activeDistancePoints.length === 0) {
        addActiveDistancePoint(lastCursorLatLng);
      }
    }
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Control') {
      ctrlHeld = false;
      commitActiveRoute();
      clearDistancePreview();
      setSnapCursorMeasureMode(false);
      const snapTarget = lastCursorLatLng ? findMeasureSnapTarget(lastCursorLatLng) : null;
      if (snapTarget?.marker) {
        setActiveSnapMarker(snapTarget.marker);
        updateSnapCursor(map.latLngToContainerPoint(snapTarget.latlng), true);
      } else {
        clearActiveSnapMarker();
      }
      document.getElementById('map').style.cursor = '';
      document.getElementById('map').classList.remove('measure-mode');
    }
  });

  window.addEventListener('blur', () => {
    ctrlHeld = false;
    commitActiveRoute();
    clearDistancePreview();
    clearActiveSnapMarker();
    setSnapCursorMeasureMode(false);
    hideSnapCursor();
    document.getElementById('map').style.cursor = '';
    document.getElementById('map').classList.remove('measure-mode');
  });

  document.addEventListener('click', e => {
    if ((e.ctrlKey || ctrlHeld) && e.target.closest('#map')) {
      e.stopPropagation();
      e.preventDefault();

      const latlng = resolveMeasureLatLng(map.mouseEventToLatLng(e));
      const lastPoint = activeDistancePoints[activeDistancePoints.length - 1];
      if (lastPoint && getMeasurePointDistance(lastPoint, latlng) < 0.5) return;
      addActiveDistancePoint(latlng);
    }
  }, true);

  map.getContainer().addEventListener('mouseleave', () => {
    pointerInsideMap = false;
    lastCursorLatLng = null;
    hideSnapCursor();
  });

  map.on('mousemove', e => {
    pointerInsideMap = true;
    lastCursorLatLng = e.latlng;

    if (ctrlHeld && activeDistancePoints.length > 0) {
      const lastPoint = activeDistancePoints[activeDistancePoints.length - 1];
      const snapTarget = findMeasureSnapTarget(e.latlng);
      const previewPoint = snapTarget?.latlng || e.latlng;

      if (tempLine) tempLine.setLatLngs([lastPoint, previewPoint]);
      else tempLine = ensureAnimatedRoute(L.polyline([lastPoint, previewPoint], { color: '#f43f5e', weight: 2, dashArray: '6, 4', opacity: 0.6, className: 'animated-route' }).addTo(map));

      if (snapTarget?.marker) {
        setActiveSnapMarker(snapTarget.marker);
        updateSnapCursor(map.latLngToContainerPoint(snapTarget.latlng), true);
      } else {
        clearActiveSnapMarker();
        updateSnapCursor(e.containerPoint, false);
      }

      let totalPx = 0;
      for (let i = 0; i < activeDistancePoints.length - 1; i++) {
        const d1 = activeDistancePoints[i];
        const d2 = activeDistancePoints[i + 1];
        totalPx += getMeasurePointDistance(d1, d2);
      }
      totalPx += getMeasurePointDistance(lastPoint, previewPoint);

      const totalNm = totalPx / PIXELS_PER_NM;
      const displayValue = Math.round(totalNm * 1000);
      const segmentValue = Math.round((segmentPx / PIXELS_PER_NM) * 1000);
      const labelPoint = getMeasureLabelLatLng(lastPoint, previewPoint, { ignoredElements: [tempLabel?._icon] });

      if (tempLabel) {
        tempLabel.setLatLng(labelPoint);
        tempLabel.setIcon(createDistanceLabelIcon(displayValue));
      } else {
        tempLabel = L.marker(labelPoint, {
          icon: createDistanceLabelIcon(displayValue),
          interactive: false,
          opacity: 0.7
        }).addTo(map);
      }

      setDistanceInfoValue(displayValue);
    }
  });

  map.on('zoomend', () => {
    if (activeDistancePoints.length > 0) redrawActiveDistanceLayers();
    distanceRoutes.forEach(renderSavedRoute);
  });

  document.getElementById('distance-clear')?.addEventListener('click', clearAllDistances);
}
function renderSavedRoute(route) {
  route.layerGroup.clearLayers();
  if (route.points.length < 2) return;

  let totalPx = 0;
  for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i];
    const dot = L.marker(p, {
      icon: createDistancePointHandleIcon(),
      draggable: true,
      autoPan: true,
      keyboard: false
    });
    dot.on('click', event => {
      event.originalEvent?.stopPropagation?.();
    });
    dot.on('dragstart', () => {
      hideContextMenu();
      map.dragging?.disable?.();
    });
    dot.on('dragend', event => {
      route.points[i] = resolveMeasureLatLng(event.target.getLatLng());
      map.dragging?.enable?.();
      renderSavedRoute(route);
      saveDistanceRoutes();
    });
    route.layerGroup.addLayer(dot);

    if (i > 0) {
      const prev = route.points[i - 1];
      const segmentPx = getMeasurePointDistance(prev, p);
      totalPx += segmentPx;

      const line = L.polyline([prev, p], {
        color: '#f43f5e',
        weight: 2,
        dashArray: '6, 4',
        className: 'animated-route',
        interactive: false
      });
      ensureAnimatedRoute(line);
      route.layerGroup.addLayer(line);

      const totalNm = totalPx / PIXELS_PER_NM;
      const displayValue = Math.round(totalNm * 1000);
      const segmentValue = Math.round((segmentPx / PIXELS_PER_NM) * 1000);
      const label = L.marker(getMeasureLabelLatLng(prev, p), {
        icon: createDistanceLabelIcon(displayValue),
        interactive: true,
        keyboard: false
      });

      label.on('contextmenu', event => {
        if (event.originalEvent) L.DomEvent.stop(event.originalEvent);
        hideContextMenu();
        deleteDistanceRouteStage(route, i);
      });

      label.on('click', event => {
        event.originalEvent?.stopPropagation?.();
      });

      label.on('mouseover', () => label.setIcon(createDistanceLabelIcon(segmentValue)));
      label.on('mouseout', () => label.setIcon(createDistanceLabelIcon(displayValue)));
      label.on('focus', () => label.setIcon(createDistanceLabelIcon(segmentValue)));
      label.on('blur', () => label.setIcon(createDistanceLabelIcon(displayValue)));

      route.layerGroup.addLayer(label);
    }
  }
}

function clearAllDistances() {
  clearDistancePreview();
  activeDistanceLayers.forEach(layer => map.removeLayer(layer));
  activeDistanceLayers = [];
  activeDistancePoints = [];
  distanceRoutes.forEach(route => map.removeLayer(route.layerGroup));
  distanceRoutes = [];
  saveDistanceRoutes();
  document.getElementById('distance-info')?.classList.remove('visible');
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Control') return; // handled by distance tool

    const shortcuts = {
      '1': 'toggle-ports', '2': 'toggle-lighthouses', '3': 'toggle-routes',
      '4': 'toggle-islands', '5': 'toggle-production', '6': 'toggle-altars',
      '7': 'toggle-forts', '8': 'toggle-pvp', '9': 'toggle-custom'
    };
    if (shortcuts[e.key]) { document.getElementById(shortcuts[e.key])?.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); document.getElementById('search-input')?.focus(); }
    if (e.key === 'd' || e.key === 'D') document.getElementById('btn-darkmode')?.click();
    if (e.key === 'l' || e.key === 'L') document.getElementById('legend-header')?.click();
    if (e.key === 'Escape') { document.getElementById('search-results')?.classList.remove('visible'); hideContextMenu(); }
  });
}

// =============================================================================
// LANGUAGE TOGGLE
// =============================================================================
function initLanguageToggle() {
  document.getElementById('btn-lang-en')?.addEventListener('click', () => setLanguage('en'));
  document.getElementById('btn-lang-de')?.addEventListener('click', () => setLanguage('de'));
}

// =============================================================================
// URL STATE
// =============================================================================
function saveUrlState() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const activeLayers = [];
  document.querySelectorAll('.layer-toggle.active').forEach(el => activeLayers.push(el.id.replace('toggle-', '')));
  const darkMode = document.getElementById('map')?.classList.contains('dark-mode') ? 1 : 0;
  try { history.replaceState(null, '', '#' + `z=${zoom}&lat=${Math.round(center.lat)}&lng=${Math.round(center.lng)}&layers=${activeLayers.join(',')}&dark=${darkMode}&lang=${currentLang}`); } catch (e) { }
}

function restoreUrlState() {
  const hash = window.location.hash.substring(1);
  if (!hash) return;
  const params = {};
  hash.split('&').forEach(part => { const [key, val] = part.split('='); params[key] = val; });

  if (params.z && params.lat && params.lng) map.setView([parseInt(params.lat), parseInt(params.lng)], parseInt(params.z));

  if (params.layers) {
    const activeLayers = params.layers.split(',');
    const allToggleIds = ['ports', 'lighthouses', 'routes', 'distance-routes', 'route-animation', 'islands', 'production', 'altars', 'forts', 'pvp', 'custom', 'myisland', 'radius'];
    allToggleIds.forEach(name => {
      const el = document.getElementById('toggle-' + name);
      if (!el) return;
      const shouldBeActive = activeLayers.includes(name);
      if (shouldBeActive !== el.classList.contains('active')) el.click();
    });
  }

  if (params.dark === '1') document.getElementById('btn-darkmode')?.click();
  if (params.lang && params.lang !== currentLang) setLanguage(params.lang, { silent: true });
}

// =============================================================================
// EXPORT/IMPORT
// =============================================================================
function initExportImport() {
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const data = JSON.stringify(customMarkers, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wosb-custom-markers.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('btn-import')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) throw new Error('invalid');
          customLayerGroup.clearLayers();
          customMarkers = imported.map((marker, index) => ({
            id: marker.id || Date.now() + index,
            lat: Number(marker.lat),
            lng: Number(marker.lng),
            label: marker.label || t('customMarkerDefault')
          })).filter(marker => Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
          customMarkers.forEach(cm => addCustomMarkerToMap(cm));
          saveCustomMarkers();
          autoExpandPersonalPOIs();
          refreshPOIStyles();
          showToast(tf('customMarkersImported', { count: customMarkers.length }), 'success');
        } catch (err) {
          console.error(err);
          showError(t('invalidJsonFile'));
        }
      };
      reader.readAsText(file);
    });
    input.click();
  });
}
// =============================================================================
// HELPERS
// =============================================================================
function hideLoading() { const el = document.querySelector('.map-loading'); if (el) el.style.display = 'none'; }

























































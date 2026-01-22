/**
 * RIOT Games / Tencent Peering Coverage Globe
 * 
 * Visual Semantics:
 * - RIOT locations: Red pins + city labels (reference only, no arcs)
 * - Tencent POPs: Blue pins, no labels (main network nodes)
 * - Partners: Small labels near POPs
 * 
 * Arc Logic:
 * - POP → Partner: Local fan-out arcs (dotted, animated)
 * - Hub → Hub: Regional backbone arcs (subtle, elegant)
 */

import Globe from 'globe.gl';
import riotLocations from './data/riot-locations.json';
import peeringData from './data/peering.json';

// ============================================================================
// CONFIGURATION
// ============================================================================

const EARTH_TEXTURE_URL = '//unpkg.com/three-globe/example/img/earth-night.jpg';
const EARTH_BUMP_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';

const CONFIG = {
  // RIOT locations (red pins + city labels)
  riotPinColor: '#ff4646',
  riotPinAltitude: 0.02,
  riotPinRadius: 1.0,
  riotLabelColor: '#ffffff',
  riotLabelSize: 1.0,
  riotLabelAltitude: 0.03,

  // Tencent POPs (blue pins, no labels)
  popPinColor: '#3458b0',
  popPinAltitude: 0.015,
  popPinRadius: 0.7,

  // Partners (small labels near POPs)
  partnerLabelColor: 'rgba(255, 255, 255, 0.7)',
  partnerLabelSize: 0.5,
  partnerLabelAltitude: 0.01,

  // Local fan-out arcs (POP → Partner)
  localArcColors: ['#3458b0', '#64b5f6'],
  localArcAltitude: 0.05,
  localArcStroke: 0.6,
  localArcDashLength: 0.3,
  localArcDashGap: 0.15,
  localArcDashAnimateTime: 2000,

  // Backbone arcs (Hub → Hub)
  backboneArcColors: ['#3458b0', '#1a237e'],
  backboneArcAltitude: 0.25,
  backboneArcStroke: 0.4,
  backboneArcDashLength: 0.5,
  backboneArcDashGap: 0.3,
  backboneArcDashAnimateTime: 4000,

  // Camera
  initialAltitude: 2.4,
  cameraFlyDuration: 1500,

  // Auto rotate
  autoRotateSpeed: 0.6
};

// ============================================================================
// REGION ASSIGNMENT
// ============================================================================

/**
 * Assigns a region based on geographic coordinates.
 * Rules:
 *   - APAC: lng >= 60
 *   - EMEA: lng > -30 AND lng < 60
 *   - NA (North America): lng <= -30 AND lat >= 15
 *   - LATAM: lng <= -30 AND lat < 15
 */
function assignRegion(lat, lng) {
  if (lng >= 60) return 'APAC';
  if (lng > -30 && lng < 60) return 'EMEA';
  if (lng <= -30 && lat >= 15) return 'NA';
  if (lng <= -30 && lat < 15) return 'LATAM';
  return 'UNKNOWN';
}

// ============================================================================
// HUB RESOLUTION
// ============================================================================

/**
 * Predefined hub cities for each region.
 * These are the primary backbone connection points.
 */
const HUB_CITIES = {
  APAC: { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  EMEA: { name: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
  NA: { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  LATAM: { name: 'Sao Paulo', lat: -23.5558, lng: -46.6396 }
};

/**
 * Calculate haversine distance between two points (in km).
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Finds the hub POP for a given region.
 * First tries to match the predefined hub city, then falls back to nearest POP.
 */
function resolveHubForRegion(region, popsInRegion) {
  if (!popsInRegion || popsInRegion.length === 0) return null;

  const hubCity = HUB_CITIES[region];
  if (!hubCity) return popsInRegion[0]; // Fallback to first POP

  // Try exact match by city name
  const exactMatch = popsInRegion.find(
    pop => pop.city.toLowerCase() === hubCity.name.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // Fallback: find nearest POP to the hub coordinates
  let nearest = popsInRegion[0];
  let minDist = haversineDistance(hubCity.lat, hubCity.lng, nearest.lat, nearest.lng);

  for (const pop of popsInRegion.slice(1)) {
    const dist = haversineDistance(hubCity.lat, hubCity.lng, pop.lat, pop.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = pop;
    }
  }

  return nearest;
}

// ============================================================================
// DATA PROCESSING
// ============================================================================

function processData(riotData, partnerData) {
  // 1. Process RIOT locations (red pins + city labels, no network participation)
  const riotPoints = riotData.locations.map(location => ({
    lat: location.lat,
    lng: location.lng,
    name: location.city,
    region: location.region,
    type: 'riot'
  }));

  // 2. Process Tencent POPs (blue pins, positioned at riotLat/riotLng in peering.json)
  const popPoints = [];
  const partnerLabels = [];
  const localArcs = [];

  // Group POPs by region for hub resolution
  const popsByRegion = { APAC: [], EMEA: [], NA: [], LATAM: [] };

  partnerData.partners.forEach(cityData => {
    const popLat = cityData.riotLat;
    const popLng = cityData.riotLng;
    const region = assignRegion(popLat, popLng);

    const popPoint = {
      lat: popLat,
      lng: popLng,
      city: cityData.city,
      region: region,
      type: 'pop'
    };

    popPoints.push(popPoint);

    if (popsByRegion[region]) {
      popsByRegion[region].push(popPoint);
    }

    // Process partners for this POP
    cityData.partners.forEach(partner => {
      // Partner labels (small text near POP)
      partnerLabels.push({
        lat: partner.lat,
        lng: partner.lng,
        name: partner.name,
        city: cityData.city,
        type: 'partner'
      });

      // Local fan-out arc: POP → Partner
      localArcs.push({
        startLat: popLat,
        startLng: popLng,
        endLat: partner.lat,
        endLng: partner.lng,
        city: cityData.city,
        partner: partner.name,
        type: 'local'
      });
    });
  });

  // 3. Resolve regional hubs
  const hubs = {};
  for (const region of Object.keys(popsByRegion)) {
    hubs[region] = resolveHubForRegion(region, popsByRegion[region]);
  }

  // 4. Generate backbone arcs (Hub → Hub only)
  const backboneArcs = [];
  const regions = Object.keys(hubs).filter(r => hubs[r] !== null);

  // Create hub-to-hub connections (simple chain + cross-links for resilience visual)
  // APAC <-> EMEA <-> NA <-> LATAM (and APAC <-> NA for Pacific route)
  const hubConnections = [
    ['APAC', 'EMEA'],   // Asia-Europe backbone
    ['EMEA', 'NA'],     // Trans-Atlantic
    ['NA', 'LATAM'],    // Americas backbone
    ['APAC', 'NA'],     // Trans-Pacific
    ['EMEA', 'LATAM'],  // Europe-South America
    ['APAC', 'LATAM']   // Asia-South America (optional, for completeness)
  ];

  hubConnections.forEach(([regionA, regionB]) => {
    const hubA = hubs[regionA];
    const hubB = hubs[regionB];

    if (hubA && hubB) {
      backboneArcs.push({
        startLat: hubA.lat,
        startLng: hubA.lng,
        endLat: hubB.lat,
        endLng: hubB.lng,
        fromHub: hubA.city,
        toHub: hubB.city,
        fromRegion: regionA,
        toRegion: regionB,
        type: 'backbone'
      });
    }
  });

  // 5. Create RIOT city labels (positioned at RIOT locations)
  const riotLabels = riotPoints.map(rp => ({
    lat: rp.lat,
    lng: rp.lng,
    name: rp.name,
    type: 'riotLabel'
  }));

  return {
    riotPoints,
    popPoints,
    partnerLabels,
    riotLabels,
    localArcs,
    backboneArcs,
    hubs,
    popsByRegion
  };
}

// ============================================================================
// GLOBE INITIALIZATION
// ============================================================================

const container = document.getElementById('globe-container');
const tooltip = document.getElementById('tooltip');

if (!container) throw new Error('Missing #globe-container in index.html');
if (!tooltip) throw new Error('Missing #tooltip in index.html');

const {
  riotPoints,
  popPoints,
  partnerLabels,
  riotLabels,
  localArcs,
  backboneArcs,
  hubs,
  popsByRegion
} = processData(riotLocations, peeringData);

const globe = Globe()
  .globeImageUrl(EARTH_TEXTURE_URL)
  .bumpImageUrl(EARTH_BUMP_URL)
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('#3a228a')
  .atmosphereAltitude(0.25)
  .width(window.innerWidth)
  .height(window.innerHeight);

globe(container);

// Set initial camera position
globe.pointOfView({ lat: 30, lng: 120, altitude: CONFIG.initialAltitude }, 0);

// Enable auto rotate
const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = CONFIG.autoRotateSpeed;

// ============================================================================
// TOOLTIP HANDLING
// ============================================================================

let mouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;

  if (tooltip.classList.contains('visible')) {
    tooltip.style.left = `${mouse.x + 15}px`;
    tooltip.style.top = `${mouse.y + 15}px`;
  }
});

function showTooltip(html) {
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  tooltip.style.left = `${mouse.x + 15}px`;
  tooltip.style.top = `${mouse.y + 15}px`;
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// ============================================================================
// RENDER: POINTS (RIOT + POPs)
// ============================================================================

const allPoints = [
  ...riotPoints,
  ...popPoints
];

globe
  .pointsData(allPoints)
  .pointLat('lat')
  .pointLng('lng')
  .pointAltitude(d => d.type === 'riot' ? CONFIG.riotPinAltitude : CONFIG.popPinAltitude)
  .pointRadius(d => d.type === 'riot' ? CONFIG.riotPinRadius : CONFIG.popPinRadius)
  .pointColor(d => d.type === 'riot' ? CONFIG.riotPinColor : CONFIG.popPinColor)
  .onPointClick((point) => {
    if (point) {
      globe.pointOfView(
        { lat: point.lat, lng: point.lng, altitude: 1.2 },
        CONFIG.cameraFlyDuration
      );
    }
  })
  .onPointHover((point) => {
    if (point) {
      if (point.type === 'riot') {
        showTooltip(`
          <div class="riot-tooltip">
            <strong>RIOT Games</strong><br>
            ${point.name}<br>
            <small>Region: ${point.region}</small>
          </div>
        `);
      } else if (point.type === 'pop') {
        const isHub = Object.values(hubs).some(h => h && h.city === point.city);
        showTooltip(`
          <div class="pop-tooltip">
            <strong>Tencent POP</strong><br>
            ${point.city}${isHub ? ' (Regional Hub)' : ''}<br>
            <small>Region: ${point.region}</small>
          </div>
        `);
      }
    } else {
      hideTooltip();
    }
  });

// ============================================================================
// RENDER: LABELS (RIOT city labels + Partner labels)
// ============================================================================

const allLabels = [
  ...riotLabels,
  ...partnerLabels
];

globe
  .labelsData(allLabels)
  .labelLat('lat')
  .labelLng('lng')
  .labelText('name')
  .labelSize(d => d.type === 'riotLabel' ? CONFIG.riotLabelSize : CONFIG.partnerLabelSize)
  .labelColor(d => d.type === 'riotLabel' ? CONFIG.riotLabelColor : CONFIG.partnerLabelColor)
  .labelAltitude(d => d.type === 'riotLabel' ? CONFIG.riotLabelAltitude : CONFIG.partnerLabelAltitude)
  .labelResolution(2);

// ============================================================================
// RENDER: ARCS (Local fan-out + Backbone)
// ============================================================================

const allArcs = [
  ...localArcs,
  ...backboneArcs
];

globe
  .arcsData(allArcs)
  .arcStartLat('startLat')
  .arcStartLng('startLng')
  .arcEndLat('endLat')
  .arcEndLng('endLng')
  .arcColor(d => d.type === 'backbone' ? CONFIG.backboneArcColors : CONFIG.localArcColors)
  .arcAltitude(d => d.type === 'backbone' ? CONFIG.backboneArcAltitude : CONFIG.localArcAltitude)
  .arcStroke(d => d.type === 'backbone' ? CONFIG.backboneArcStroke : CONFIG.localArcStroke)
  .arcDashLength(d => d.type === 'backbone' ? CONFIG.backboneArcDashLength : CONFIG.localArcDashLength)
  .arcDashGap(d => d.type === 'backbone' ? CONFIG.backboneArcDashGap : CONFIG.localArcDashGap)
  .arcDashInitialGap(() => Math.random())
  .arcDashAnimateTime(d => d.type === 'backbone' ? CONFIG.backboneArcDashAnimateTime : CONFIG.localArcDashAnimateTime)
  .onArcHover((arc) => {
    if (arc) {
      if (arc.type === 'backbone') {
        showTooltip(`
          <div class="backbone-tooltip">
            <strong>Backbone Connection</strong><br>
            ${arc.fromHub} (${arc.fromRegion}) → ${arc.toHub} (${arc.toRegion})
          </div>
        `);
      } else {
        showTooltip(`
          <div class="local-tooltip">
            <strong>Local Peering</strong><br>
            ${arc.city} → ${arc.partner}
          </div>
        `);
      }
    } else {
      hideTooltip();
    }
  });

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

let idleTimer = null;

function pauseAutoRotate() {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
}

function resumeAutoRotateLater() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    controls.autoRotate = true;
  }, 4000);
}

container.addEventListener('mousedown', pauseAutoRotate);
container.addEventListener('touchstart', pauseAutoRotate, { passive: true });
container.addEventListener('mouseup', resumeAutoRotateLater);
container.addEventListener('touchend', resumeAutoRotateLater, { passive: true });
container.addEventListener('wheel', () => { pauseAutoRotate(); resumeAutoRotateLater(); }, { passive: true });

// Responsive resize
window.addEventListener('resize', () => {
  globe.width(window.innerWidth);
  globe.height(window.innerHeight);
});

// ============================================================================
// DEBUG (Development only)
// ============================================================================

if (import.meta.env.DEV) {
  window.riotGlobe = {
    globe,
    data: {
      riotPoints,
      popPoints,
      partnerLabels,
      riotLabels,
      localArcs,
      backboneArcs,
      hubs,
      popsByRegion
    },
    config: CONFIG
  };

  console.log('Tencent Peering Globe initialized:', {
    riotLocations: riotPoints.length,
    tencentPOPs: popPoints.length,
    partners: partnerLabels.length,
    localArcs: localArcs.length,
    backboneArcs: backboneArcs.length,
    hubs: Object.entries(hubs).map(([r, h]) => `${r}: ${h?.city || 'none'}`).join(', ')
  });
}

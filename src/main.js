/**
 * RIOT Games / Tencent Peering Coverage Globe
 * 
 * Visual Semantics:
 * - RIOT locations: Red pins + city labels (reference only, no arcs)
 * - Tencent POPs: Blue pins, no labels (main network nodes)
 * - Partners: Small labels near POPs (arranged in dynamic rings)
 * 
 * Arc Logic:
 * - POP → Partner: Local fan-out arcs (dotted, animated, dominant)
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
  // ===== GLOBAL ANIMATION TOGGLE =====
  // Set to false to disable all animations (arc dash movement + auto rotate)
  ENABLE_ANIMATION: true,

  // ===== ARC FILTERING =====
  // Skip arcs where partner name normalizes to this
  selfPartnerName: 'tencent',
  // Skip arcs shorter than this distance (km)
  minArcDistanceKm: 15,

  // ===== RIOT locations (red pins + city labels) =====
  riotPinColor: '#ff4646',
  riotPinAltitude: 0.02,
  riotPinRadius: 1.0,
  riotLabelColor: '#ffffff',
  riotLabelSize: 1.0,
  riotLabelAltitude: 0.03,

  // ===== Tencent POPs (blue pins, no labels) =====
  popPinColor: '#3458b0',
  popPinAltitude: 0.015,
  popPinRadius: 0.7,

  // ===== Partners (small labels + optional anchor dots) =====
  partnerLabelColor: 'rgba(255, 255, 255, 0.75)',
  partnerLabelSize: 0.45,
  partnerLabelAltitude: 0.012,
  // Partner anchor dots (small dots at partner positions for visibility)
  partnerDotColor: 'rgba(100, 181, 246, 0.6)',
  partnerDotRadius: 0.25,
  partnerDotAltitude: 0.008,

  // ===== Dynamic ring radius for partner positioning =====
  // Based on partner count per POP
  ringRadius: {
    small: { min: 2, max: 4, radiusMin: 0.6, radiusMax: 0.9 },   // degrees
    medium: { min: 5, max: 8, radiusMin: 1.0, radiusMax: 1.4 },
    large: { min: 9, max: Infinity, radiusMin: 1.6, radiusMax: 2.2 }
  },
  // Maximum latitude offset (clamp to avoid poles)
  maxLatitudeOffset: 85,

  // ===== Local fan-out arcs (POP → Partner) - DOMINANT =====
  localArcColors: ['rgba(100, 181, 246, 0.85)', 'rgba(52, 88, 176, 0.85)'],
  localArcAltitudeShort: 0.18,   // For short arcs (more visible)
  localArcAltitudeLong: 0.08,   // For long arcs
  localArcStrokeShort: 0.9,     // Thicker for short arcs
  localArcStrokeLong: 0.5,
  localArcDashLength: 0.25,
  localArcDashGap: 0.12,
  localArcDashAnimateTime: 1500,  // Faster, more visible motion

  // ===== Backbone arcs (Hub → Hub) - SUBTLE =====
  backboneArcColors: ['rgba(52, 88, 176, 0.4)', 'rgba(26, 35, 126, 0.4)'],
  backboneArcAltitude: 0.3,
  backboneArcStroke: 0.3,
  backboneArcDashLength: 0.6,
  backboneArcDashGap: 0.4,
  backboneArcDashAnimateTime: 6000,  // Slower, calmer animation

  // ===== Camera =====
  initialAltitude: 2.4,
  cameraFlyDuration: 1500,

  // ===== Auto rotate =====
  autoRotateSpeed: 0.5
};

// ============================================================================
// UTILITY: HAVERSINE DISTANCE
// ============================================================================

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

// ============================================================================
// ARC FILTERING
// ============================================================================

/**
 * Determines if an arc should be filtered out.
 * Rules:
 * 1. Partner name normalizes to "Tencent" (self-arc)
 * 2. Distance between POP and partner < minArcDistanceKm
 */
function shouldFilterArc(partnerName, popLat, popLng, partnerLat, partnerLng) {
  // Rule 1: Self-arc (Tencent partner)
  if (partnerName.toLowerCase().trim() === CONFIG.selfPartnerName) {
    return true;
  }

  // Rule 2: Too close (near-duplicate)
  const distance = haversineDistance(popLat, popLng, partnerLat, partnerLng);
  if (distance < CONFIG.minArcDistanceKm) {
    return true;
  }

  return false;
}

// ============================================================================
// DYNAMIC RING RADIUS FOR PARTNER POSITIONING
// ============================================================================

/**
 * Calculate ring radius based on partner count.
 * More partners = larger ring to avoid overlap.
 */
function getRingRadius(partnerCount) {
  const { small, medium, large } = CONFIG.ringRadius;
  
  if (partnerCount <= small.max) {
    // Linear interpolation within small range
    const t = (partnerCount - small.min) / (small.max - small.min + 1);
    return small.radiusMin + t * (small.radiusMax - small.radiusMin);
  } else if (partnerCount <= medium.max) {
    const t = (partnerCount - medium.min) / (medium.max - medium.min + 1);
    return medium.radiusMin + t * (medium.radiusMax - medium.radiusMin);
  } else {
    // Large: cap at max
    const t = Math.min((partnerCount - large.min) / 5, 1);
    return large.radiusMin + t * (large.radiusMax - large.radiusMin);
  }
}

/**
 * Position partners in a ring around the POP.
 * Applies:
 * - Dynamic radius based on partner count
 * - cos(lat) correction for longitude
 * - Latitude clamp to avoid poles
 */
function positionPartnersInRing(popLat, popLng, partners) {
  const count = partners.length;
  if (count === 0) return [];

  const baseRadius = getRingRadius(count);
  const angleStep = (2 * Math.PI) / count;

  return partners.map((partner, index) => {
    const angle = angleStep * index - Math.PI / 2; // Start from top
    
    // Apply cos(lat) correction for longitude to maintain circular appearance
    const cosLat = Math.cos(popLat * Math.PI / 180);
    const lngCorrection = cosLat > 0.1 ? 1 / cosLat : 10; // Avoid division issues near poles
    
    let newLat = popLat + baseRadius * Math.sin(angle);
    let newLng = popLng + baseRadius * Math.cos(angle) * Math.min(lngCorrection, 3);
    
    // Clamp latitude to avoid pole issues
    newLat = Math.max(-CONFIG.maxLatitudeOffset, Math.min(CONFIG.maxLatitudeOffset, newLat));
    
    return {
      ...partner,
      lat: newLat,
      lng: newLng,
      originalLat: partner.lat,
      originalLng: partner.lng
    };
  });
}

// ============================================================================
// DISTANCE-BASED ARC PROPERTIES
// ============================================================================

/**
 * Calculate arc altitude based on distance.
 * Short arcs get higher altitude to be more visible.
 */
function getLocalArcAltitude(distanceKm) {
  // Short arcs (< 100km): higher altitude
  // Long arcs (> 500km): lower altitude
  // Linear interpolation between
  const minDist = 50;
  const maxDist = 500;
  const t = Math.min(1, Math.max(0, (distanceKm - minDist) / (maxDist - minDist)));
  return CONFIG.localArcAltitudeShort * (1 - t) + CONFIG.localArcAltitudeLong * t;
}

/**
 * Calculate arc stroke based on distance.
 * Short arcs get thicker stroke to be more visible.
 */
function getLocalArcStroke(distanceKm) {
  const minDist = 50;
  const maxDist = 500;
  const t = Math.min(1, Math.max(0, (distanceKm - minDist) / (maxDist - minDist)));
  return CONFIG.localArcStrokeShort * (1 - t) + CONFIG.localArcStrokeLong * t;
}

// ============================================================================
// REGION ASSIGNMENT
// ============================================================================

/**
 * Assigns a region based on geographic coordinates.
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

const HUB_CITIES = {
  APAC: { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  EMEA: { name: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
  NA: { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  LATAM: { name: 'Sao Paulo', lat: -23.5558, lng: -46.6396 }
};

function resolveHubForRegion(region, popsInRegion) {
  if (!popsInRegion || popsInRegion.length === 0) return null;

  const hubCity = HUB_CITIES[region];
  if (!hubCity) return popsInRegion[0];

  const exactMatch = popsInRegion.find(
    pop => pop.city.toLowerCase() === hubCity.name.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // Fallback: nearest POP
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
  // 1. Process RIOT locations
  const riotPoints = riotData.locations.map(location => ({
    lat: location.lat,
    lng: location.lng,
    name: location.city,
    region: location.region,
    type: 'riot'
  }));

  // 2. Process Tencent POPs and partners
  const popPoints = [];
  const partnerLabels = [];
  const partnerDots = [];
  const localArcs = [];
  const popsByRegion = { APAC: [], EMEA: [], NA: [], LATAM: [] };

  let filteredArcCount = 0;

  partnerData.partners.forEach(cityData => {
    const popLat = cityData.riotLat;
    const popLng = cityData.riotLng;
    const region = assignRegion(popLat, popLng);

    const popPoint = {
      lat: popLat,
      lng: popLng,
      city: cityData.city,
      region: region,
      type: 'pop',
      partnerCount: cityData.partners.length
    };

    popPoints.push(popPoint);

    if (popsByRegion[region]) {
      popsByRegion[region].push(popPoint);
    }

    // Filter and position partners
    const validPartners = cityData.partners.filter(partner => {
      const shouldFilter = shouldFilterArc(
        partner.name, popLat, popLng, partner.lat, partner.lng
      );
      if (shouldFilter) filteredArcCount++;
      return !shouldFilter;
    });

    // Position partners in a ring around the POP
    const positionedPartners = positionPartnersInRing(popLat, popLng, validPartners);

    positionedPartners.forEach(partner => {
      // Partner label
      partnerLabels.push({
        lat: partner.lat,
        lng: partner.lng,
        name: partner.name,
        city: cityData.city,
        type: 'partner'
      });

      // Partner anchor dot (small visual marker)
      partnerDots.push({
        lat: partner.lat,
        lng: partner.lng,
        name: partner.name,
        city: cityData.city,
        type: 'partnerDot'
      });

      // Calculate distance for arc properties
      const distance = haversineDistance(popLat, popLng, partner.lat, partner.lng);

      // Local fan-out arc
      localArcs.push({
        startLat: popLat,
        startLng: popLng,
        endLat: partner.lat,
        endLng: partner.lng,
        city: cityData.city,
        partner: partner.name,
        type: 'local',
        distance: distance
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
  const hubConnections = [
    ['APAC', 'EMEA'],
    ['EMEA', 'NA'],
    ['NA', 'LATAM'],
    ['APAC', 'NA'],
    ['EMEA', 'LATAM'],
    ['APAC', 'LATAM']
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

  // 5. RIOT city labels
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
    partnerDots,
    riotLabels,
    localArcs,
    backboneArcs,
    hubs,
    popsByRegion,
    filteredArcCount
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
  partnerDots,
  riotLabels,
  localArcs,
  backboneArcs,
  hubs,
  popsByRegion,
  filteredArcCount
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

// Auto rotate (controlled by ENABLE_ANIMATION)
const controls = globe.controls();
controls.autoRotate = CONFIG.ENABLE_ANIMATION;
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
// RENDER: POINTS (RIOT + POPs + Partner anchor dots)
// ============================================================================

const allPoints = [
  ...riotPoints,
  ...popPoints,
  ...partnerDots
];

globe
  .pointsData(allPoints)
  .pointLat('lat')
  .pointLng('lng')
  .pointAltitude(d => {
    if (d.type === 'riot') return CONFIG.riotPinAltitude;
    if (d.type === 'pop') return CONFIG.popPinAltitude;
    return CONFIG.partnerDotAltitude;
  })
  .pointRadius(d => {
    if (d.type === 'riot') return CONFIG.riotPinRadius;
    if (d.type === 'pop') return CONFIG.popPinRadius;
    return CONFIG.partnerDotRadius;
  })
  .pointColor(d => {
    if (d.type === 'riot') return CONFIG.riotPinColor;
    if (d.type === 'pop') return CONFIG.popPinColor;
    return CONFIG.partnerDotColor;
  })
  .onPointClick((point) => {
    if (point && (point.type === 'riot' || point.type === 'pop')) {
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
            <small>Region: ${point.region} | Partners: ${point.partnerCount}</small>
          </div>
        `);
      } else if (point.type === 'partnerDot') {
        showTooltip(`
          <div class="partner-tooltip">
            <strong>${point.name}</strong><br>
            <small>Peering with ${point.city}</small>
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
  .arcAltitude(d => {
    if (d.type === 'backbone') return CONFIG.backboneArcAltitude;
    return getLocalArcAltitude(d.distance || 100);
  })
  .arcStroke(d => {
    if (d.type === 'backbone') return CONFIG.backboneArcStroke;
    return getLocalArcStroke(d.distance || 100);
  })
  .arcDashLength(d => d.type === 'backbone' ? CONFIG.backboneArcDashLength : CONFIG.localArcDashLength)
  .arcDashGap(d => d.type === 'backbone' ? CONFIG.backboneArcDashGap : CONFIG.localArcDashGap)
  .arcDashInitialGap(() => Math.random())
  .arcDashAnimateTime(d => {
    if (!CONFIG.ENABLE_ANIMATION) return 0; // Disable animation
    return d.type === 'backbone' ? CONFIG.backboneArcDashAnimateTime : CONFIG.localArcDashAnimateTime;
  })
  .onArcHover((arc) => {
    if (arc) {
      if (arc.type === 'backbone') {
        showTooltip(`
          <div class="backbone-tooltip">
            <strong>Global Backbone</strong><br>
            ${arc.fromHub} (${arc.fromRegion}) ↔ ${arc.toHub} (${arc.toRegion})
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
    if (CONFIG.ENABLE_ANIMATION) {
      controls.autoRotate = true;
    }
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
      partnerDots,
      riotLabels,
      localArcs,
      backboneArcs,
      hubs,
      popsByRegion
    },
    config: CONFIG,
    toggleAnimation: (enabled) => {
      CONFIG.ENABLE_ANIMATION = enabled;
      controls.autoRotate = enabled;
      // Re-render arcs with new animation setting
      globe.arcsData([...localArcs, ...backboneArcs]);
      console.log(`Animation ${enabled ? 'enabled' : 'disabled'}`);
    }
  };

  console.log('Tencent Peering Globe initialized:', {
    riotLocations: riotPoints.length,
    tencentPOPs: popPoints.length,
    partners: partnerLabels.length,
    localArcs: localArcs.length,
    backboneArcs: backboneArcs.length,
    filteredArcs: filteredArcCount,
    hubs: Object.entries(hubs).map(([r, h]) => `${r}: ${h?.city || 'none'}`).join(', '),
    animationEnabled: CONFIG.ENABLE_ANIMATION
  });
}

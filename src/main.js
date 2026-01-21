/**
 * RIOT Games Peering Coverage Globe
 * 3D visualization of peering partners across global data centers
 */

import Globe from 'globe.gl';
import peeringData from './data/peering.json';

// ============================================================================
// CONFIGURATION - Easy to modify
// ============================================================================

// Earth texture URL - replace with your own if needed
// const EARTH_TEXTURE_URL = '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg'; // Blue marble texture
const EARTH_TEXTURE_URL = '//unpkg.com/three-globe/example/img/earth-dark.jpg';
const EARTH_BUMP_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';

// Visual settings
const CONFIG = {
  // Globe
  globeRotationSpeed: 0.0003,      // Auto-rotation speed (radians per frame)
  
  // City pins
  cityPinColor: '#ff4646',         // Red color for RIOT cities
  cityPinAltitude: 0.01,           // Height above globe surface
  cityPinRadius: 0.4,              // Pin size
  
  // Partner labels
  partnerRingRadius: 1.5,          // Distance from city (in degrees)
  partnerLabelAltitude: 0.02,      // Height above globe
  
  // Arcs
  arcColor: ['#ff4646', '#4ecdc4'], // Gradient from city (red) to partner (teal)
  arcAltitude: 0.12,               // Arc height
  arcDashLength: 0.4,              // Length of dash segments
  arcDashGap: 0.2,                 // Gap between dashes
  arcDashAnimateTime: 2000,        // Animation duration (ms)
  arcStroke: 0.5,                  // Arc thickness
  
  // Camera
  cameraFlyDuration: 1500,         // Click-to-fly animation duration (ms)
  initialAltitude: 2.5,            // Initial camera distance
};

// ============================================================================
// DATA PROCESSING
// ============================================================================

/**
 * Calculate partner label positions arranged in a ring around the city
 * @param {Object} city - City data with lat, lng, partners
 * @returns {Array} Partner positions with lat, lng, name
 */
function calculatePartnerPositions(city) {
  const partners = city.partners || [];
  const numPartners = partners.length;
  
  if (numPartners === 0) return [];
  
  return partners.map((partner, index) => {
    // Spread partners evenly in a circle
    const angle = (2 * Math.PI * index) / numPartners;
    
    // Calculate offset - correct longitude by cos(lat) for spherical distortion
    const latRad = (city.lat * Math.PI) / 180;
    const latOffset = CONFIG.partnerRingRadius * Math.sin(angle);
    const lngOffset = (CONFIG.partnerRingRadius * Math.cos(angle)) / Math.cos(latRad);
    
    return {
      lat: city.lat + latOffset,
      lng: city.lng + lngOffset,
      name: partner,
      city: city.city
    };
  });
}

/**
 * Generate arc data connecting cities to their partners
 * @param {Object} city - City data
 * @param {Array} partnerPositions - Calculated partner positions
 * @returns {Array} Arc objects for globe.gl
 */
function generateArcs(city, partnerPositions) {
  return partnerPositions.map(partner => ({
    startLat: city.lat,
    startLng: city.lng,
    endLat: partner.lat,
    endLng: partner.lng,
    city: city.city,
    partner: partner.name
  }));
}

/**
 * Process raw peering data into globe-ready format
 * @param {Object} data - Raw peering.json data
 * @returns {Object} Processed data for cities, partners, and arcs
 */
function processData(data) {
  const cities = data.cities || [];
  const allPartners = [];
  const allArcs = [];
  
  cities.forEach(city => {
    const partnerPositions = calculatePartnerPositions(city);
    allPartners.push(...partnerPositions);
    allArcs.push(...generateArcs(city, partnerPositions));
  });
  
  return {
    cities: cities.map(c => ({
      lat: c.lat,
      lng: c.lng,
      name: c.city,
      size: CONFIG.cityPinRadius,
      color: CONFIG.cityPinColor
    })),
    partners: allPartners,
    arcs: allArcs
  };
}

// ============================================================================
// GLOBE INITIALIZATION
// ============================================================================

// Get DOM elements
const container = document.getElementById('globe-container');
const tooltip = document.getElementById('tooltip');

// Validate container exists
if (!container) {
  console.error('Globe container not found!');
  throw new Error('Globe container element #globe-container not found');
}

// Process the peering data
const { cities, partners, arcs } = processData(peeringData);

// Initialize the globe
const globe = Globe()
  .globeImageUrl(EARTH_TEXTURE_URL)
  .bumpImageUrl(EARTH_BUMP_URL)
  .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('#3a228a')
  .atmosphereAltitude(0.25)
  .width(window.innerWidth)
  .height(window.innerHeight);

// Mount globe to container
globe(container);

// Set initial camera position
globe.pointOfView({ lat: 30, lng: 120, altitude: CONFIG.initialAltitude });

// ============================================================================
// CITY POINTS (Red Pins)
// ============================================================================

globe
  .pointsData(cities)
  .pointLat('lat')
  .pointLng('lng')
  .pointAltitude(CONFIG.cityPinAltitude)
  .pointRadius('size')
  .pointColor('color')
  .pointLabel(d => `<div class="city-label">${d.name}</div>`)
  .onPointClick(handleCityClick)
  .onPointHover(handleCityHover);

// ============================================================================
// PARTNER LABELS
// ============================================================================

globe
  .labelsData(partners)
  .labelLat('lat')
  .labelLng('lng')
  .labelText('name')
  .labelSize(0.5)
  .labelDotRadius(0.15)
  .labelColor(() => '#4ecdc4')
  .labelAltitude(CONFIG.partnerLabelAltitude)
  .labelResolution(2)
  .onLabelHover(handlePartnerHover);

// ============================================================================
// ANIMATED ARCS
// ============================================================================

globe
  .arcsData(arcs)
  .arcStartLat('startLat')
  .arcStartLng('startLng')
  .arcEndLat('endLat')
  .arcEndLng('endLng')
  .arcColor(() => CONFIG.arcColor)
  .arcAltitude(CONFIG.arcAltitude)
  .arcStroke(CONFIG.arcStroke)
  .arcDashLength(CONFIG.arcDashLength)
  .arcDashGap(CONFIG.arcDashGap)
  .arcDashAnimateTime(CONFIG.arcDashAnimateTime)
  .onArcHover(handleArcHover);

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

/**
 * Handle city pin click - fly camera to focus on city
 */
function handleCityClick(city) {
  if (!city) return;
  
  globe.pointOfView(
    { lat: city.lat, lng: city.lng, altitude: 1.0 },
    CONFIG.cameraFlyDuration
  );
}

/**
 * Handle city pin hover
 */
function handleCityHover(city, prevCity) {
  if (city) {
    showTooltip(`<span class="city-name">${city.name}</span>`, event);
  } else {
    hideTooltip();
  }
}

/**
 * Handle partner label hover
 */
function handlePartnerHover(partner, prevPartner) {
  if (partner) {
    showTooltip(
      `City: <span class="city-name">${partner.city}</span> | ` +
      `Partner: <span class="partner-name">${partner.name}</span>`,
      event
    );
  } else {
    hideTooltip();
  }
}

/**
 * Handle arc hover
 */
function handleArcHover(arc, prevArc) {
  if (arc) {
    showTooltip(
      `City: <span class="city-name">${arc.city}</span> | ` +
      `Partner: <span class="partner-name">${arc.partner}</span>`,
      event
    );
  } else {
    hideTooltip();
  }
}

/**
 * Show tooltip at mouse position
 */
function showTooltip(html, mouseEvent) {
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  
  // Position tooltip near mouse
  if (mouseEvent) {
    const x = mouseEvent.clientX || mouseEvent.pageX || 0;
    const y = mouseEvent.clientY || mouseEvent.pageY || 0;
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
  }
}

/**
 * Hide tooltip
 */
function hideTooltip() {
  tooltip.classList.remove('visible');
}

// Track mouse position for tooltip
document.addEventListener('mousemove', (e) => {
  if (tooltip.classList.contains('visible')) {
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.top = `${e.clientY + 15}px`;
  }
});

// ============================================================================
// AUTO-ROTATION
// ============================================================================

let autoRotate = true;

// Animation loop for auto-rotation
function animate() {
  if (autoRotate) {
    const currentPov = globe.pointOfView();
    globe.pointOfView({
      lat: currentPov.lat,
      lng: currentPov.lng + CONFIG.globeRotationSpeed * 50,
      altitude: currentPov.altitude
    });
  }
  requestAnimationFrame(animate);
}

// Start animation
animate();

// Pause rotation when user interacts with globe
container.addEventListener('mousedown', () => { autoRotate = false; });
container.addEventListener('touchstart', () => { autoRotate = false; });

// Resume rotation after inactivity
let idleTimer;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { autoRotate = true; }, 5000);
}

container.addEventListener('mouseup', resetIdleTimer);
container.addEventListener('touchend', resetIdleTimer);
container.addEventListener('wheel', () => {
  autoRotate = false;
  resetIdleTimer();
});

// ============================================================================
// RESPONSIVE HANDLING
// ============================================================================

window.addEventListener('resize', () => {
  globe.width(window.innerWidth);
  globe.height(window.innerHeight);
});

// ============================================================================
// EXPORT FOR DEBUGGING (optional)
// ============================================================================

if (import.meta.env.DEV) {
  window.riotGlobe = {
    globe,
    data: { cities, partners, arcs },
    config: CONFIG
  };
  console.log('RIOT Globe initialized. Access via window.riotGlobe');
}

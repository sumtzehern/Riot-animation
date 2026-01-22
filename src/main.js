/**
 * RIOT Games Peering Coverage Globe
 * Red dots: RIOT locations, Blue dots: Partners, White labels: City names
 */

import Globe from 'globe.gl';
import riotLocations from './data/riot-locations.json';
import peeringData from './data/peering.json';

// Earth texture URL
const EARTH_TEXTURE_URL = '//unpkg.com/three-globe/example/img/earth-night.jpg';
const EARTH_BUMP_URL = '//unpkg.com/three-globe/example/img/earth-topology.png';

// Visual settings
const CONFIG = {
  // RIOT locations (red dots)
  riotPinColor: '#ff4646',
  riotPinAltitude: 0.02,
  riotPinRadius: 1.2,
  
  // Partner locations (Tencent PoPs - blue dots)
  partnerPinColor: '#3458b0',
  partnerPinAltitude: 0.02,
  partnerPinRadius: 0.8,
  
  // City labels (white text) - positioned at RIOT locations
  cityLabelColor: '#ffffff',
  cityLabelAltitude: 0.04,  // Higher than pins so they're visible
  cityLabelSize: 1.2,

  // Arcs
  arcColor: ['#ff4646', '#3458b0'],
  arcAltitude: 0.12,
  arcDashLength: 0.4,
  arcDashGap: 4,
  arcDashAnimateTime: 1100,
  arcStroke: 1.0,

  // Camera
  initialAltitude: 2.4,
  cameraFlyDuration: 1500,

  // Auto rotate
  autoRotateSpeed: 0.6
};

// ----------------------------
// Data processing
// ----------------------------

function processData(riotData, partnerData) {
  // Process RIOT locations (red dots)
  const riotPoints = riotData.locations.map(location => ({
    lat: location.lat,
    lng: location.lng,
    name: location.city,
    region: location.region,
    type: 'riot'
  }));

  // Process partner locations (blue dots) and arcs
  const partnerPoints = [];
  const arcs = [];

  partnerData.partners.forEach(cityData => {
    // Add partner points (blue dots) and arcs
    cityData.partners.forEach(partner => {
      partnerPoints.push({
        lat: partner.lat,
        lng: partner.lng,
        name: partner.name,
        city: cityData.city,
        type: 'partner'
      });

      // Create arc from RIOT location to partner
      arcs.push({
        startLat: cityData.riotLat,
        startLng: cityData.riotLng,
        endLat: partner.lat,
        endLng: partner.lng,
        city: cityData.city,
        partner: partner.name
      });
    });
  });

  // Create city labels positioned at RIOT locations (not partner locations)
  const cityLabels = riotPoints.map(riotPoint => ({
    lat: riotPoint.lat,
    lng: riotPoint.lng,
    name: riotPoint.name,
    type: 'cityLabel'
  }));

  return {
    riotPoints,
    partnerPoints,
    cityLabels,
    arcs
  };
}

// ----------------------------
// Init
// ----------------------------

const container = document.getElementById('globe-container');
const tooltip = document.getElementById('tooltip');

if (!container) throw new Error('Missing #globe-container in index.html');
if (!tooltip) throw new Error('Missing #tooltip in index.html');

const { riotPoints, partnerPoints, cityLabels, arcs } = processData(riotLocations, peeringData);

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

// IMPORTANT: Use built in auto rotate (do not do manual POV update loop)
const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = CONFIG.autoRotateSpeed;

// ----------------------------
// Tooltip mouse tracking
// ----------------------------

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

// ----------------------------
// All points (red RIOT dots + blue partner dots)
// ----------------------------

// Combine all points data with type indicators
const allPoints = [
  ...riotPoints.map(p => ({ ...p, type: 'riot' })),
  ...partnerPoints.map(p => ({ ...p, type: 'partner' }))
];

globe
  .pointsData(allPoints)
  .pointLat('lat')
  .pointLng('lng')
  .pointAltitude(d => d.type === 'riot' ? CONFIG.riotPinAltitude : CONFIG.partnerPinAltitude)
  .pointRadius(d => d.type === 'riot' ? CONFIG.riotPinRadius : CONFIG.partnerPinRadius)
  .pointColor(d => d.type === 'riot' ? CONFIG.riotPinColor : CONFIG.partnerPinColor)
  .onPointClick((point) => {
    if (point && point.type === 'riot') {
      handleRiotClick(point);
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
      } else {
        showTooltip(`
          <div class="partner-tooltip">
            <strong>Partner:</strong> ${point.name}<br>
            <strong>City:</strong> ${point.city}
          </div>
        `);
      }
    } else {
      hideTooltip();
    }
  });

// ----------------------------
// City labels (white text) - positioned at RIOT locations
// ----------------------------

globe
  .labelsData(cityLabels)
  .labelLat('lat')
  .labelLng('lng')
  .labelText('name')
  .labelSize(CONFIG.cityLabelSize)
  .labelColor(() => CONFIG.cityLabelColor)
  .labelAltitude(CONFIG.cityLabelAltitude)
  .labelResolution(2);

// ----------------------------
// Arcs (connections from RIOT to partners)
// ----------------------------

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
  .arcDashInitialGap(() => Math.random() * CONFIG.arcDashGap)
  .arcDashAnimateTime(CONFIG.arcDashAnimateTime)
  .onArcHover((arc) => {
    if (arc) {
      showTooltip(`
        <div class="arc-tooltip">
          <strong>${arc.city}</strong> → <strong>${arc.partner}</strong>
        </div>
      `);
    } else {
      hideTooltip();
    }
  });

// ----------------------------
// Click handlers and interactions
// ----------------------------

function handleRiotClick(riotPoint) {
  if (!riotPoint) return;
  globe.pointOfView(
    { lat: riotPoint.lat, lng: riotPoint.lng, altitude: 1.0 },
    CONFIG.cameraFlyDuration
  );
}

// Pause auto rotate while user interacts, resume after idle
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

container.addEventListener('mousedown', () => { pauseAutoRotate(); });
container.addEventListener('touchstart', () => { pauseAutoRotate(); }, { passive: true });
container.addEventListener('mouseup', () => { resumeAutoRotateLater(); });
container.addEventListener('touchend', () => { resumeAutoRotateLater(); }, { passive: true });
container.addEventListener('wheel', () => { pauseAutoRotate(); resumeAutoRotateLater(); }, { passive: true });

// Responsive resize
window.addEventListener('resize', () => {
  globe.width(window.innerWidth);
  globe.height(window.innerHeight);
});

// Debug
if (import.meta.env.DEV) {
  window.riotGlobe = { 
    globe, 
    data: { riotPoints, partnerPoints, cityLabels, arcs }, 
    config: CONFIG 
  };
  console.log('RIOT Globe initialized:', { riotPoints: riotPoints.length, partnerPoints: partnerPoints.length, arcs: arcs.length });
}

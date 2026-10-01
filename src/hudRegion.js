/**
 * @module hudRegion
 * @description The coarse region tag in the HUD summary line ("EUROPE",
 * "BALKANS", "BOSNIA AND HERZEGOVINA", …).
 *
 * Split out of `hud.js` so it is unit-testable in plain Node (hud.js pulls in
 * the `mgrs` CommonJS package). Checks run most-specific first: the country
 * outline, then the Balkan peninsula, then the continental boxes.
 */

/**
 * Bosnia and Herzegovina outline as an open [lon, lat] ring, from the bundled
 * Natural Earth admin-0 pack (src/data/local_data/natural_earth/countries.json,
 * public domain), Douglas–Peucker simplified at 0.015°. Precise enough for a
 * label; the border itself is drawn by the boundaries layer.
 */
export const BIH_OUTLINE = Object.freeze([
  [17.702, 42.92],
  [17.812, 42.91],
  [17.858, 42.817],
  [18.224, 42.628],
  [18.339, 42.603],
  [18.385, 42.567],
  [18.492, 42.565],
  [18.487, 42.59],
  [18.538, 42.618],
  [18.55, 42.668],
  [18.445, 42.817],
  [18.473, 42.863],
  [18.434, 42.937],
  [18.453, 42.993],
  [18.539, 43.024],
  [18.639, 43.02],
  [18.621, 43.123],
  [18.688, 43.224],
  [18.664, 43.233],
  [18.834, 43.324],
  [18.821, 43.341],
  [18.923, 43.347],
  [18.992, 43.267],
  [19.07, 43.309],
  [19.01, 43.411],
  [18.946, 43.444],
  [18.911, 43.507],
  [19, 43.548],
  [19.055, 43.507],
  [19.123, 43.536],
  [19.217, 43.533],
  [19.253, 43.589],
  [19.347, 43.609],
  [19.411, 43.541],
  [19.432, 43.571],
  [19.49, 43.564],
  [19.477, 43.617],
  [19.506, 43.674],
  [19.462, 43.762],
  [19.229, 43.958],
  [19.244, 44.002],
  [19.273, 44.012],
  [19.365, 43.973],
  [19.529, 43.977],
  [19.61, 44.019],
  [19.611, 44.055],
  [19.522, 44.085],
  [19.466, 44.153],
  [19.443, 44.143],
  [19.381, 44.177],
  [19.307, 44.274],
  [19.157, 44.294],
  [19.107, 44.383],
  [19.141, 44.431],
  [19.13, 44.518],
  [19.18, 44.538],
  [19.188, 44.576],
  [19.318, 44.715],
  [19.369, 44.887],
  [19.31, 44.912],
  [19.202, 44.908],
  [19.187, 44.928],
  [19.068, 44.875],
  [18.89, 44.861],
  [18.783, 44.914],
  [18.773, 44.942],
  [18.805, 44.974],
  [18.792, 45.002],
  [18.738, 45.016],
  [18.678, 45.087],
  [18.649, 45.063],
  [18.617, 45.098],
  [18.535, 45.09],
  [18.541, 45.055],
  [18.517, 45.056],
  [18.412, 45.112],
  [18.238, 45.157],
  [18.154, 45.098],
  [18.003, 45.149],
  [17.911, 45.081],
  [17.836, 45.064],
  [17.685, 45.164],
  [17.572, 45.12],
  [17.482, 45.114],
  [17.496, 45.142],
  [17.448, 45.134],
  [17.443, 45.162],
  [17.382, 45.14],
  [17.269, 45.19],
  [17.245, 45.155],
  [17.187, 45.149],
  [17.056, 45.2],
  [17.036, 45.23],
  [17.008, 45.216],
  [17.008, 45.244],
  [16.947, 45.236],
  [16.924, 45.285],
  [16.812, 45.181],
  [16.529, 45.222],
  [16.482, 45.2],
  [16.436, 45.133],
  [16.389, 45.117],
  [16.341, 45.006],
  [16.316, 45.001],
  [16.213, 45.031],
  [16.122, 45.096],
  [16.067, 45.17],
  [16.024, 45.184],
  [16.02, 45.214],
  [15.879, 45.217],
  [15.792, 45.19],
  [15.756, 45.042],
  [15.764, 44.976],
  [15.731, 44.927],
  [15.773, 44.845],
  [15.716, 44.803],
  [15.728, 44.769],
  [15.806, 44.697],
  [15.889, 44.724],
  [15.969, 44.639],
  [16.028, 44.625],
  [16.045, 44.589],
  [16.006, 44.541],
  [16.116, 44.521],
  [16.16, 44.416],
  [16.138, 44.378],
  [16.203, 44.36],
  [16.188, 44.282],
  [16.216, 44.208],
  [16.327, 44.082],
  [16.414, 44.056],
  [16.44, 44.014],
  [16.501, 43.993],
  [16.679, 43.841],
  [16.713, 43.772],
  [17.031, 43.548],
  [17.143, 43.489],
  [17.271, 43.463],
  [17.286, 43.437],
  [17.268, 43.353],
  [17.29, 43.303],
  [17.4, 43.216],
  [17.442, 43.152],
  [17.628, 43.047],
  [17.663, 42.966],
  [17.581, 42.942],
  [17.618, 42.922],
  [17.556, 42.935],
  [17.653, 42.891],
]);

/** Bounding box of BIH_OUTLINE, so most of the planet skips the ring walk. */
const BIH_BOX = Object.freeze({
  south: 42.5,
  north: 45.3,
  west: 15.7,
  east: 19.7,
});

/**
 * A hand-drawn Balkan peninsula: the Adriatic/Ionian coast (pushed seaward to
 * keep the islands), north along the Slovenian and Croatian borders, east on
 * the Sava/Danube line to the Black Sea, and south through Thrace and Greece.
 * A polygon rather than a lat/lon box so the Italian Adriatic coast (Bari,
 * Pescara) stays EUROPE. Open [lon, lat] ring.
 */
export const BALKANS_OUTLINE = Object.freeze([
  [13.4, 45.7],
  [13.6, 46.55],
  [16.1, 46.9],
  [16.6, 46.5],
  [17.3, 46.0],
  [18.9, 45.95],
  [20.3, 46.15],
  [21.4, 44.85],
  [22.7, 44.25],
  [24.0, 43.7],
  [25.6, 43.65],
  [27.0, 44.1],
  [28.6, 43.75],
  [28.2, 41.9],
  [29.2, 41.2],
  [26.5, 40.2],
  [26.0, 40.0],
  [24.2, 39.6],
  [24.3, 38.3],
  [24.2, 37.6],
  [23.2, 36.3],
  [21.6, 36.6],
  [20.9, 37.8],
  [19.8, 39.4],
  [19.1, 40.4],
  [19.2, 41.8],
  [18.3, 42.4],
  [17.0, 42.75],
  [15.9, 43.4],
  [14.6, 44.2],
  [14.0, 44.8],
  [13.4, 44.9],
]);

const BALKANS_BOX = Object.freeze({ south: 36, north: 47, west: 13, east: 30 });

const inBox = (box, lat, lon) =>
  lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;

/** Even-odd point-in-ring test; ring is [[lon, lat], …], open or closed. */
export function pointInRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/**
 * Coarse geographic region label for a camera sub-point.
 * @param {number} lat Latitude in decimal degrees.
 * @param {number} lon Longitude in decimal degrees.
 * @returns {string} Region name (e.g. `"EUROPE"`, `"NORTHERN OCEANIC GRID"`).
 */
export function regionLabel(lat, lon) {
  if (lat > 72) return 'ARCTIC';
  if (lat < -60) return 'ANTARCTIC';
  if (inBox(BIH_BOX, lat, lon) && pointInRing(BIH_OUTLINE, lat, lon))
    return 'BOSNIA AND HERZEGOVINA';
  if (inBox(BALKANS_BOX, lat, lon) && pointInRing(BALKANS_OUTLINE, lat, lon))
    return 'BALKANS';
  if (lat >= 5 && lat <= 83 && lon >= -170 && lon <= -50)
    return 'NORTH AMERICA';
  if (lat >= -60 && lat <= 15 && lon >= -90 && lon <= -30)
    return 'SOUTH AMERICA';
  if (lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45) return 'EUROPE';
  if (lat >= -35 && lat <= 38 && lon >= -20 && lon <= 55) return 'AFRICA';
  if (lat >= 5 && lat <= 80 && lon >= 45 && lon <= 180) return 'ASIA';
  if (lat >= -50 && lat <= 5 && lon >= 110 && lon <= 180) return 'OCEANIA';
  return lat >= 0 ? 'NORTHERN OCEANIC GRID' : 'SOUTHERN OCEANIC GRID';
}

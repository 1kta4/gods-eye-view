import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BIH_OUTLINE,
  BALKANS_OUTLINE,
  pointInRing,
  regionLabel,
} from './hudRegion.js';
import { CITY_POIS } from './locations.js';
import { composeLocalityTag, NEAR_POI_MAX_KM } from './hudLocality.js';

const BIH = 'BOSNIA AND HERZEGOVINA';

test('every bundled BiH city reads BOSNIA AND HERZEGOVINA', () => {
  for (const id of [
    'sarajevo',
    'mostar',
    'banjaluka',
    'tuzla',
    'zenica',
    'bihac',
    'bijeljina',
    'brcko',
    'prijedor',
    'doboj',
    'trebinje',
    'travnik',
    'gorazde',
    'livno',
    'neum',
    'jajce',
    'konjic',
    'visegrad',
    'srebrenica',
    'foca',
    'cazin',
    'zvornik',
  ]) {
    const city = CITY_POIS[id];
    assert.ok(city, `${id} is bundled`);
    const { lat, lon } = city.pois[0];
    assert.equal(regionLabel(lat, lon), BIH, `${city.name} ${lat},${lon}`);
  }
});

test('the neighbours read BALKANS, not Bosnia', () => {
  for (const [name, lat, lon] of [
    ['Zagreb', 45.815, 15.982],
    ['Split', 43.508, 16.44],
    ['Dubrovnik', 42.65, 18.094],
    ['Belgrade', 44.787, 20.457],
    ['Novi Sad', 45.267, 19.833],
    ['Podgorica', 42.441, 19.263],
    ['Kotor', 42.424, 18.771],
    ['Tirana', 41.328, 19.819],
    ['Skopje', 41.998, 21.425],
    ['Sofia', 42.698, 23.322],
    ['Ljubljana', 46.056, 14.506],
    ['Thessaloniki', 40.64, 22.944],
    ['Athens', 37.984, 23.728],
  ]) {
    assert.equal(regionLabel(lat, lon), 'BALKANS', name);
  }
});

test('the Italian Adriatic coast, Hungary and Romania stay EUROPE', () => {
  for (const [name, lat, lon] of [
    ['Bari', 41.117, 16.872],
    ['Pescara', 42.464, 14.214],
    ['Venice', 45.44, 12.316],
    ['Budapest', 47.498, 19.04],
    ['Bucharest', 44.427, 26.103],
    ['Vienna', 48.208, 16.373],
    ['Paris', 48.857, 2.352],
  ]) {
    assert.equal(regionLabel(lat, lon), 'EUROPE', name);
  }
});

test('the rest of the planet keeps its old labels', () => {
  assert.equal(regionLabel(30.27, -97.74), 'NORTH AMERICA');
  assert.equal(regionLabel(-22.9, -43.2), 'SOUTH AMERICA');
  assert.equal(regionLabel(35.68, 139.69), 'ASIA');
  assert.equal(regionLabel(-1.29, 36.82), 'AFRICA');
  assert.equal(regionLabel(-33.87, 151.21), 'OCEANIA');
  assert.equal(regionLabel(80, 0), 'ARCTIC');
  assert.equal(regionLabel(-70, 0), 'ANTARCTIC');
  assert.equal(regionLabel(0, -150), 'NORTHERN OCEANIC GRID');
  assert.equal(regionLabel(-10, -150), 'SOUTHERN OCEANIC GRID');
  // Non-finite input behaves exactly as the old box chain did.
  assert.equal(regionLabel(Number.NaN, Number.NaN), 'SOUTHERN OCEANIC GRID');
});

test('the outlines are sane rings', () => {
  for (const ring of [BIH_OUTLINE, BALKANS_OUTLINE]) {
    assert.ok(ring.length >= 10);
    for (const [lon, lat] of ring) {
      assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
    }
  }
  // The Neum corridor is Bosnian; the Pelješac side of it is not.
  assert.equal(pointInRing(BIH_OUTLINE, 42.925, 17.616), true);
  assert.equal(pointInRing(BIH_OUTLINE, 42.85, 17.55), false);
});

test('hud.js labels its summary through this module', () => {
  const source = readFileSync(new URL('./hud.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ regionLabel \} from '\.\/hudRegion\.js';/);
  assert.match(
    source,
    /_regionLabel\(lat, lon\) \{\s*return regionLabel\(lat, lon\);/,
  );
});

// ── NEAR <place> anywhere in BiH ────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Same scan as IntelHUD._nearestKnownPoint over the same flattened table. */
function nearestPoi(lat, lon) {
  let best = null;
  for (const city of Object.values(CITY_POIS)) {
    for (const poi of city.pois) {
      const distKm = haversineKm(lat, lon, poi.lat, poi.lon);
      if (!best || distKm < best.distKm)
        best = { city: city.name, poi: poi.name, distKm };
    }
  }
  return best;
}

test('every point inside BiH is NEAR a bundled place, and close to one', () => {
  let sampled = 0;
  let worst = 0;
  for (let lat = 42.55; lat <= 45.3; lat += 0.05) {
    for (let lon = 15.7; lon <= 19.65; lon += 0.05) {
      if (!pointInRing(BIH_OUTLINE, lat, lon)) continue;
      sampled++;
      const nearest = nearestPoi(lat, lon);
      worst = Math.max(worst, nearest.distKm);
      assert.match(composeLocalityTag(nearest, lat, lon), /^NEAR /);
    }
  }
  assert.ok(sampled > 1000, `sampled ${sampled} points`);
  // Far inside the 150 km cutoff: the readout names a real neighbour.
  assert.ok(worst < 60, `worst gap ${worst.toFixed(1)} km`);
  assert.ok(worst < NEAR_POI_MAX_KM);
});

test('the HUD names local landmarks with their own spelling', () => {
  assert.equal(
    composeLocalityTag(nearestPoi(43.8597, 18.4312), 43.8597, 18.4312),
    'NEAR BAŠČARŠIJA (SARAJEVO) 0KM',
  );
  assert.equal(
    composeLocalityTag(nearestPoi(43.3373, 17.815), 43.3373, 17.815),
    'NEAR STARI MOST (MOSTAR) 0KM',
  );
});

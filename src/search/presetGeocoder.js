import { foldedSpellings } from './diacritics.js';

/** Half-width of the box a bundled landmark is framed with, in degrees. */
const LANDMARK_HALF_SPAN_DEG = 0.005;

/**
 * Fold a name to the forms an exact comparison uses: case, accents, spacing,
 * punctuation. Accents fold away so a plain keyboard reaches a local name
 * ("Bascarsija" → Baščaršija, "Brcko" → Brčko); `đ` folds to both "dj" and "d".
 * @returns {string[]}
 */
function normalizeNames(value) {
  return foldedSpellings(value || '').map((folded) =>
    folded
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/** Keep a generated box inside the poles and inside the dateline. */
function boundedBox(lat, lon, halfSpan) {
  const wrap = (value) => {
    const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
    return wrapped === -180 ? 180 : wrapped;
  };
  return {
    southwest: {
      lat: Math.max(-90, lat - halfSpan),
      lng: wrap(lon - halfSpan),
    },
    northeast: { lat: Math.min(90, lat + halfSpan), lng: wrap(lon + halfSpan) },
  };
}

/**
 * Build the exact-match index once, so a search is a lookup rather than a scan.
 *
 * Only exact names match. A bundled preset that answered a partial or fuzzy
 * query would shadow the real geocoders for everything that merely resembles a
 * bundled name, and the operator would have no way to reach the place they
 * meant.
 */
function indexPresets(presets) {
  const byName = new Map();
  const remember = (key, place) => {
    for (const name of normalizeNames(key))
      if (name && !byName.has(name)) byName.set(name, place);
  };
  const aliasesOf = (row) => (Array.isArray(row?.aliases) ? row.aliases : []);

  for (const [cityId, city] of Object.entries(presets || {})) {
    const anchor = city?.pois?.[0];
    const bounds = city?.viewBounds;
    const lat = Number(anchor?.lat);
    const lon = Number(anchor?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const place = {
        lat,
        lng: lon,
        name: city.name,
        label: city.name,
        types: ['locality'],
        exact: true,
        viewport:
          Number.isFinite(bounds?.southwest?.lat) &&
          Number.isFinite(bounds?.southwest?.lng) &&
          Number.isFinite(bounds?.northeast?.lat) &&
          Number.isFinite(bounds?.northeast?.lng)
            ? {
                southwest: {
                  lat: bounds.southwest.lat,
                  lng: bounds.southwest.lng,
                },
                northeast: {
                  lat: bounds.northeast.lat,
                  lng: bounds.northeast.lng,
                },
              }
            : boundedBox(lat, lon, 0.1),
      };
      remember(cityId, place);
      remember(city.name, place);
      for (const alias of aliasesOf(city)) remember(alias, place);
    }

    for (const poi of city?.pois || []) {
      const poiLat = Number(poi?.lat);
      const poiLon = Number(poi?.lon);
      if (!Number.isFinite(poiLat) || !Number.isFinite(poiLon)) continue;
      const landmark = {
        lat: poiLat,
        lng: poiLon,
        name: poi.name,
        label: city?.name ? `${poi.name}, ${city.name}` : poi.name,
        types: ['point_of_interest'],
        exact: true,
        viewport: boundedBox(poiLat, poiLon, LANDMARK_HALF_SPAN_DEG),
      };
      remember(poi.name, landmark);
      for (const alias of aliasesOf(poi)) remember(alias, landmark);
    }
  }
  return byName;
}

/**
 * Answer the bundled city and landmark names without asking anyone.
 *
 * Matching is exact on the city id, the city name, a landmark name, or one of
 * their listed `aliases` (accent-insensitive); anything else is passed on to
 * the network geocoders untouched.
 */
export function createPresetGeocoder({ presets = {} } = {}) {
  const byName = indexPresets(presets);
  return {
    async geocode(query, { signal } = {}) {
      signal?.throwIfAborted();
      const [key] = normalizeNames(query);
      const place = byName.get(key);
      return place
        ? { place, answered: true }
        : { place: null, answered: true };
    },
  };
}

/**
 * Bosnia and Herzegovina layer manifest. One row per toggle in the
 * "Bosnia & Herzegovina" panel group. `module` names the file under
 * src/layers/bosnia/ that owns the layer; rows without public data stay
 * IN PRODUCTION placeholders (see inProduction.js).
 */
export const BOSNIA_LAYERS = Object.freeze([
  // Live feeds
  { id: 'ba-earthquakes', token: 'b0', name: 'Earthquakes (EMSC)', icon: '🌋' },
  { id: 'ba-rivers', token: 'b1', name: 'River Levels', icon: '🌊' },
  { id: 'ba-air-quality', token: 'b2', name: 'Air Quality', icon: '💨' },
  { id: 'ba-fire-danger', token: 'b3', name: 'Fire Danger (EFFIS)', icon: '🔥' },
  {
    id: 'ba-weather-warnings',
    token: '6',
    name: 'Weather Warnings',
    icon: '⚠',
  },
  { id: 'ba-weather-now', token: 'b5', name: 'Weather Now', icon: '🌡' },
  { id: 'ba-radar', token: 'b6', name: 'Precipitation Radar', icon: '🌧' },
  {
    id: 'ba-border-crossings',
    token: '9',
    name: 'Border Crossings',
    icon: '🛂',
  },
  { id: 'ba-power', token: 'b8', name: 'Power Grid', icon: '⚡' },
  // Bundled reference data
  {
    id: 'ba-boundaries',
    token: '01',
    name: 'Entities & Municipalities',
    icon: '▦',
  },
  {
    id: 'ba-emergencies',
    token: '02',
    name: 'Disaster History (Copernicus)',
    icon: '🛰',
  },
  { id: 'ba-heritage', token: 'bb', name: 'Heritage Sites', icon: '🏛' },
  { id: 'ba-memorial', token: 'bc', name: 'War Memory 1992–95', icon: '🕯' },
  {
    id: 'ba-minefields',
    token: '05',
    name: 'Mapped Minefields (OSM)',
    icon: '☠',
  },
  { id: 'ba-airports', token: 'be', name: 'Airports & Airspace', icon: '✈' },
  { id: 'ba-rail', token: 'bf', name: 'Railways', icon: '🚆' },
  // No public data yet
  {
    id: 'ba-mines-official',
    token: '08',
    name: 'BHMAC Official Mine Areas',
    icon: '☢',
  },
  { id: 'ba-transit', token: 'bh', name: 'Sarajevo Trams & Buses', icon: '🚋' },
  {
    id: 'ba-flood-forecast',
    token: '0a',
    name: 'Flood Forecast (Sava)',
    icon: '📈',
  },
  { id: 'ba-lightning', token: 'bj', name: 'Lightning', icon: '⚡' },
]);

export const BOSNIA_LAYER_IDS = Object.freeze(
  BOSNIA_LAYERS.map((row) => row.id),
);

export function bosniaLayerRow(id) {
  const row = BOSNIA_LAYERS.find((entry) => entry.id === id);
  if (!row) throw new Error(`Unknown Bosnia layer: ${id}`);
  return row;
}

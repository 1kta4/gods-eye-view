/**
 * Bosnia and Herzegovina layer manifest. One row per toggle in the
 * "Bosnia & Herzegovina" panel group. `module` names the file under
 * src/layers/bosnia/ that owns the layer; rows without public data stay
 * IN PRODUCTION placeholders (see inProduction.js). Share-link tokens
 * (b0-bj) live in src/data/layerState.js.
 */
export const BOSNIA_LAYERS = Object.freeze([
  // Live feeds
  { id: 'ba-earthquakes', name: 'Earthquakes (EMSC)', icon: '🌋' },
  { id: 'ba-rivers', name: 'River Levels', icon: '🌊' },
  { id: 'ba-air-quality', name: 'Air Quality', icon: '💨' },
  { id: 'ba-fire-danger', name: 'Fire Danger (EFFIS)', icon: '🔥' },
  {
    id: 'ba-weather-warnings',
    name: 'Weather Warnings',
    icon: '⚠',
  },
  { id: 'ba-weather-now', name: 'Weather Now', icon: '🌡' },
  { id: 'ba-radar', name: 'Precipitation Radar', icon: '🌧' },
  {
    id: 'ba-border-crossings',
    name: 'Border Crossings',
    icon: '🛂',
  },
  { id: 'ba-power', name: 'Power Grid', icon: '⚡' },
  // Bundled reference data
  {
    id: 'ba-boundaries',
    name: 'Entities & Municipalities',
    icon: '▦',
  },
  {
    id: 'ba-emergencies',
    name: 'Disaster History (Copernicus)',
    icon: '🛰',
  },
  { id: 'ba-heritage', name: 'Heritage Sites', icon: '🏛' },
  { id: 'ba-memorial', name: 'War Memory 1992–95', icon: '🕯' },
  {
    id: 'ba-minefields',
    name: 'Mapped Minefields (OSM)',
    icon: '☠',
  },
  { id: 'ba-airports', name: 'Airports & Airspace', icon: '✈' },
  { id: 'ba-rail', name: 'Railways', icon: '🚆' },
  // No public data yet
  {
    id: 'ba-mines-official',
    name: 'BHMAC Official Mine Areas',
    icon: '☢',
  },
  { id: 'ba-transit', name: 'Sarajevo Trams & Buses', icon: '🚋' },
  {
    id: 'ba-flood-forecast',
    name: 'Flood Forecast (Sava)',
    icon: '📈',
  },
  { id: 'ba-lightning', name: 'Lightning', icon: '⚡' },
]);

export const BOSNIA_LAYER_IDS = Object.freeze(
  BOSNIA_LAYERS.map((row) => row.id),
);

export function bosniaLayerRow(id) {
  const row = BOSNIA_LAYERS.find((entry) => entry.id === id);
  if (!row) throw new Error(`Unknown Bosnia layer: ${id}`);
  return row;
}

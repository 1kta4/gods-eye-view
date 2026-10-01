/**
 * Current conditions for Bosnia and Herzegovina towns from Open-Meteo
 * (keyless, CC BY 4.0). Pure: town list, request builder, response
 * normaliser and card copy — shared by the proxy and the browser layer.
 */

/**
 * Towns and mountain stations. Elevations (m) are passed to Open-Meteo for
 * downscaling: town values are its own 90 m DEM at these points; the two
 * mountains are pinned to their summit/station height so the 2 km grid cell
 * does not report valley weather for them.
 */
const TOWN_ELEVATIONS = Object.freeze([
  543, 168, 232, 321, 64, 225, 95, 98, 144, 157, 281, 758, 508, 348, 403, 287,
  394, 325, 139, 426, 153, 566, 970, 302, 48, 476, 2067, 1880,
]);

const TOWN_LIST = [
  { id: 'sarajevo', name: 'Sarajevo', lat: 43.8563, lon: 18.4131 },
  { id: 'banja-luka', name: 'Banja Luka', lat: 44.7722, lon: 17.191 },
  { id: 'tuzla', name: 'Tuzla', lat: 44.5384, lon: 18.6763 },
  { id: 'zenica', name: 'Zenica', lat: 44.2017, lon: 17.9078 },
  { id: 'mostar', name: 'Mostar', lat: 43.3438, lon: 17.8078 },
  { id: 'bihac', name: 'Bihać', lat: 44.8169, lon: 15.8708 },
  { id: 'bijeljina', name: 'Bijeljina', lat: 44.757, lon: 19.215 },
  { id: 'brcko', name: 'Brčko', lat: 44.8727, lon: 18.8106 },
  { id: 'prijedor', name: 'Prijedor', lat: 44.9799, lon: 16.7134 },
  { id: 'doboj', name: 'Doboj', lat: 44.7349, lon: 18.0843 },
  { id: 'trebinje', name: 'Trebinje', lat: 42.7117, lon: 18.3436 },
  { id: 'livno', name: 'Livno', lat: 43.8269, lon: 17.0075 },
  { id: 'travnik', name: 'Travnik', lat: 44.2264, lon: 17.6658 },
  { id: 'gorazde', name: 'Goražde', lat: 43.6675, lon: 18.9764 },
  { id: 'foca', name: 'Foča', lat: 43.5065, lon: 18.7752 },
  { id: 'konjic', name: 'Konjic', lat: 43.6512, lon: 17.9616 },
  { id: 'jajce', name: 'Jajce', lat: 44.342, lon: 17.27 },
  { id: 'cazin', name: 'Cazin', lat: 44.967, lon: 15.943 },
  { id: 'gradacac', name: 'Gradačac', lat: 44.8789, lon: 18.4264 },
  { id: 'visoko', name: 'Visoko', lat: 43.9889, lon: 18.1781 },
  { id: 'zvornik', name: 'Zvornik', lat: 44.3865, lon: 19.1028 },
  { id: 'bugojno', name: 'Bugojno', lat: 44.0572, lon: 17.4508 },
  { id: 'gacko', name: 'Gacko', lat: 43.1667, lon: 18.5353 },
  { id: 'visegrad', name: 'Višegrad', lat: 43.7825, lon: 19.2925 },
  { id: 'neum', name: 'Neum', lat: 42.9233, lon: 17.6153 },
  { id: 'drvar', name: 'Drvar', lat: 44.3739, lon: 16.3842 },
  {
    id: 'bjelasnica',
    name: 'Bjelašnica',
    lat: 43.7158,
    lon: 18.2564,
    elevation: 2067,
    mountain: true,
  },
  {
    id: 'jahorina',
    name: 'Jahorina',
    lat: 43.7286,
    lon: 18.5778,
    elevation: 1880,
    mountain: true,
  },
];

export const BA_TOWNS = Object.freeze(
  TOWN_LIST.map((town, i) =>
    Object.freeze({ ...town, elevation: TOWN_ELEVATIONS[i] }),
  ),
);

export const CURRENT_FIELDS = Object.freeze([
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'snow_depth',
  'is_day',
]);

/** One batched forecast URL for every town. */
export function openMeteoForecastUrl(towns = BA_TOWNS) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: towns.map((t) => t.lat).join(','),
    longitude: towns.map((t) => t.lon).join(','),
    elevation: towns.map((t) => t.elevation).join(','),
    current: CURRENT_FIELDS.join(','),
    wind_speed_unit: 'kmh',
    timezone: 'Europe/Sarajevo',
  }).toString();
  return url.href;
}

/** One batched air-quality URL (CAMS European AQI + PM). */
export function openMeteoAirUrl(towns = BA_TOWNS) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({
    latitude: towns.map((t) => t.lat).join(','),
    longitude: towns.map((t) => t.lon).join(','),
    current: 'european_aqi,pm2_5,pm10',
    timezone: 'Europe/Sarajevo',
  }).toString();
  return url.href;
}

function num(value, min, max) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

/** Open-Meteo local time ("2026-10-01T15:30", utc offset seconds) → ISO. */
function localToIso(text, offsetSeconds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(text));
  if (!m || !Number.isFinite(offsetSeconds)) return null;
  const ms =
    Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetSeconds * 1000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Normalise the batched forecast (+ optional air-quality) responses. The
 * responses are arrays in the same order as the request coordinates.
 */
export function normaliseOpenMeteo(forecast, air = null, towns = BA_TOWNS) {
  const list = Array.isArray(forecast) ? forecast : [forecast];
  if (list.length !== towns.length) throw new Error('open_meteo_shape');
  const airList = Array.isArray(air) && air.length === towns.length ? air : [];
  return towns.map((town, i) => {
    const c = list[i]?.current;
    if (!c || typeof c !== 'object') throw new Error('open_meteo_shape');
    const a = airList[i]?.current || {};
    return {
      id: town.id,
      name: town.name,
      lat: town.lat,
      lon: town.lon,
      mountain: town.mountain === true,
      elevation: num(list[i].elevation, -100, 3000),
      observedAt: localToIso(c.time, list[i].utc_offset_seconds),
      temperature: num(c.temperature_2m, -60, 60),
      apparent: num(c.apparent_temperature, -80, 70),
      humidity: num(c.relative_humidity_2m, 0, 100),
      precipitation: num(c.precipitation, 0, 500),
      weatherCode: num(c.weather_code, 0, 99),
      cloudCover: num(c.cloud_cover, 0, 100),
      windSpeed: num(c.wind_speed_10m, 0, 400),
      windDirection: num(c.wind_direction_10m, 0, 360),
      windGusts: num(c.wind_gusts_10m, 0, 500),
      snowDepthCm:
        num(c.snow_depth, 0, 30) === null
          ? null
          : Math.round(c.snow_depth * 1000) / 10,
      isDay: c.is_day === 1,
      europeanAqi: num(a.european_aqi, 0, 1000),
      pm25: num(a.pm2_5, 0, 2000),
      pm10: num(a.pm10, 0, 3000),
    };
  });
}

const WMO = Object.freeze({
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, hail',
  99: 'Thunderstorm, hail',
});

export function weatherText(code) {
  return WMO[code] ?? 'Unknown';
}

/** Temperature colour ramp (°C → CSS hex), cold blue → hot red. */
const RAMP = [
  [-20, [94, 60, 153]],
  [-10, [59, 76, 192]],
  [0, [98, 160, 232]],
  [8, [120, 200, 200]],
  [15, [120, 205, 110]],
  [22, [240, 210, 60]],
  [28, [245, 140, 40]],
  [35, [215, 48, 39]],
  [42, [150, 0, 40]],
];

export function temperatureColor(t) {
  if (!Number.isFinite(t)) return '#9AA0A6';
  if (t <= RAMP[0][0]) return toHex(RAMP[0][1]);
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    if (t <= t1) {
      const [t0, c0] = RAMP[i - 1];
      const f = (t - t0) / (t1 - t0);
      return toHex(c0.map((v, k) => Math.round(v + (c1[k] - v) * f)));
    }
  }
  return toHex(RAMP[RAMP.length - 1][1]);
}

function toHex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compass(deg) {
  if (!Number.isFinite(deg)) return '';
  return COMPASS[Math.round(deg / 45) % 8];
}

function fmt(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

/** Short on-map label, e.g. "Sarajevo 21°". */
export function townLabel(town) {
  return `${town.name} ${Number.isFinite(town.temperature) ? `${Math.round(town.temperature)}°` : '—'}`;
}

/** Card copy (plain text). */
export function townCard(town) {
  const details = [
    `${weatherText(town.weatherCode)} · feels ${fmt(town.apparent)}°C · RH ${fmt(town.humidity)}%`,
    `Wind ${compass(town.windDirection)} ${fmt(town.windSpeed)} km/h · gusts ${fmt(town.windGusts)} km/h`,
    `Precip ${fmt(town.precipitation, 1)} mm · snow ${fmt(town.snowDepthCm)} cm · cloud ${fmt(town.cloudCover)}%`,
  ];
  if (Number.isFinite(town.europeanAqi))
    details.push(
      `Model air: EAQI ${fmt(town.europeanAqi)} · PM2.5 ${fmt(town.pm25, 1)} µg/m³ (CAMS)`,
    );
  const time = Date.parse(town.observedAt || '');
  details.push(
    `Open-Meteo · ${
      Number.isFinite(time)
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Sarajevo',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(time))
        : 'time unknown'
    }${Number.isFinite(town.elevation) ? ` · ${Math.round(town.elevation)} m` : ''}`,
  );
  return {
    title: `${town.name} · ${fmt(town.temperature, 1)}°C`,
    details,
    accent: temperatureColor(town.temperature),
  };
}

export function townAnalystRecord(town) {
  return {
    id: town.id,
    name: town.name,
    lat: town.lat,
    lon: town.lon,
    temperatureC: town.temperature,
    apparentC: town.apparent,
    weather: weatherText(town.weatherCode),
    windKmh: town.windSpeed,
    gustKmh: town.windGusts,
    precipitationMm: town.precipitation,
    snowDepthCm: town.snowDepthCm,
    europeanAqi: town.europeanAqi,
    observedAt: town.observedAt,
  };
}

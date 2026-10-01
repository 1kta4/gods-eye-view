import { plugins as earthquakes } from './earthquakes.js';
import { plugins as rivers } from './rivers.js';
import { plugins as air } from './air.js';
import { plugins as weather } from './weather.js';
import { plugins as roads } from './roads.js';
import { plugins as power } from './power.js';

/** Every Bosnia and Herzegovina proxy, mounted under /api/ba/*. */
export function bosniaProxies() {
  return [earthquakes, rivers, air, weather, roads, power].flatMap((make) =>
    make(),
  );
}

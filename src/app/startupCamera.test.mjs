import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { flyToAustin, flyToStartupView } from '../camera.js';
import { BIH_COUNTRY_VIEW } from '../locationsBosnia.js';
import { regionLabel } from '../hudRegion.js';

test('teardown before the initial camera delay prevents a late flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let flights = 0;
  let cancelled = 0;
  const stop = flyToAustin({
    isDestroyed: () => false,
    camera: {
      setView() {},
      flyTo() {
        flights++;
      },
      cancelFlight() {
        cancelled++;
      },
    },
  });
  stop();
  t.mock.timers.tick(1000);
  assert.equal(flights, 0);
  assert.equal(cancelled, 1);
});

test('the default start frames Bosnia and Herzegovina, then eases in', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const views = [];
  const flights = [];
  const stop = flyToStartupView({
    isDestroyed: () => false,
    camera: {
      setView(view) {
        views.push(view);
      },
      flyToBoundingSphere(sphere, options) {
        flights.push({ sphere, options });
      },
      cancelFlight() {},
    },
  });
  assert.equal(
    views.length,
    1,
    'opens straight over BiH, not the default globe',
  );
  const start = Cesium.Cartographic.fromCartesian(views[0].destination);
  assert.ok(Math.abs(Cesium.Math.toDegrees(start.latitude) - 43.9) < 0.2);
  assert.ok(Math.abs(Cesium.Math.toDegrees(start.longitude) - 17.7) < 0.01);
  t.mock.timers.tick(500);
  assert.equal(flights.length, 1);
  const target = Cesium.Cartographic.fromCartesian(flights[0].sphere.center);
  assert.ok(
    Math.abs(Cesium.Math.toDegrees(target.latitude) - BIH_COUNTRY_VIEW.lat) <
      1e-6,
  );
  assert.ok(
    Math.abs(Cesium.Math.toDegrees(target.longitude) - BIH_COUNTRY_VIEW.lon) <
      1e-6,
  );
  const { offset } = flights[0].options;
  // A slight oblique tilt, from far enough out to hold the whole country.
  assert.ok(Cesium.Math.toDegrees(offset.pitch) < -45);
  assert.ok(Cesium.Math.toDegrees(offset.pitch) >= -85);
  assert.ok(offset.range >= 500000 && offset.range <= 1200000);
  stop();
});

test('teardown before the BiH fly-in prevents a late flight', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let flights = 0;
  let cancelled = 0;
  const stop = flyToStartupView({
    isDestroyed: () => false,
    camera: {
      setView() {},
      flyToBoundingSphere() {
        flights++;
      },
      cancelFlight() {
        cancelled++;
      },
    },
  });
  stop();
  t.mock.timers.tick(1000);
  assert.equal(flights, 0);
  assert.equal(cancelled, 1);
});

test('a share link keeps its view: the BiH start runs only without share state', () => {
  const controls = readFileSync(
    new URL('./controls.js', import.meta.url),
    'utf8',
  );
  assert.match(
    controls,
    /if \(!styleManager\.hasShareState\) \{[\s\S]*?defer\(flyToStartupView\(viewer\)\);[\s\S]*?\} else \{[\s\S]*?Restoring shared view/,
  );
});

test('the startup camera itself sits over BiH, so the HUD names the country', () => {
  // Heading 0: the eye is due south of the target by range·cos(pitch).
  const { lat, lon, range, pitch } = BIH_COUNTRY_VIEW;
  const southKm = (range / 1000) * Math.cos((Math.abs(pitch) * Math.PI) / 180);
  const eyeLat = lat - southKm / 111.2;
  assert.equal(regionLabel(eyeLat, lon), 'BOSNIA AND HERZEGOVINA');
});

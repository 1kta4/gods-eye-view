import * as Cesium from 'cesium';
import { BIH_COUNTRY_VIEW } from './locationsBosnia.js';

/**
 * Camera presets for notable locations.
 * Phase 1 default: fly to Austin, TX on load.
 */
export const CAMERA_PRESETS = {
  austin: {
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 800),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-35),
      roll: 0.0,
    },
  },
  sf: {
    destination: Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1000),
    orientation: {
      heading: Cesium.Math.toRadians(30),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
  nyc: {
    destination: Cesium.Cartesian3.fromDegrees(-73.9857, 40.7484, 1200),
    orientation: {
      heading: Cesium.Math.toRadians(-20),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
};

/**
 * Fly the camera to a preset location with a smooth animation.
 */
export function flyToPreset(viewer, presetName, duration = 3.0) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  viewer.camera.flyTo({
    destination: preset.destination,
    orientation: preset.orientation,
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

/**
 * Set camera to Austin on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToAustin(viewer) {
  // Start from a high altitude, then fly down
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 25000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });

  // Cinematic fly-in after a brief pause
  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 600),
      orientation: {
        heading: Cesium.Math.toRadians(15),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0.0,
      },
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}

/** The pose that frames a {lat, lon, range, heading, pitch} view. */
function countryViewPose(view) {
  const target = Cesium.Cartesian3.fromDegrees(view.lon, view.lat, 0);
  const offset = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(view.heading),
    Cesium.Math.toRadians(view.pitch),
    view.range,
  );
  return { target, offset };
}

/**
 * Open the app on Bosnia and Herzegovina instead of Cesium's default
 * North-America view. Instant (no flight), and it runs as soon as the viewer
 * exists, so a share link or any later restore simply flies on from here.
 * @param {Cesium.Viewer} viewer
 * @param {{lat: number, lon: number, range: number, heading: number, pitch: number}} [view]
 * @returns {boolean} Whether the pose was applied.
 */
export function applyStartupView(viewer, view = BIH_COUNTRY_VIEW) {
  const camera = viewer?.camera;
  if (!camera || viewer.isDestroyed?.()) return false;
  const { target, offset } = countryViewPose(view);
  camera.lookAt(target, offset);
  // Release the lookAt frame so ordinary navigation (and later flights) work.
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  return true;
}

/**
 * Fly to the whole-country Bosnia and Herzegovina view.
 * @param {Cesium.Viewer} viewer
 * @param {{duration?: number}} [options]
 * @returns {Promise<boolean>} Resolves true when the flight lands, false when
 *   it is cancelled or the viewer is gone.
 */
export function flyToCountryView(
  viewer,
  view = BIH_COUNTRY_VIEW,
  options = {},
) {
  const camera = viewer?.camera;
  if (!camera || viewer.isDestroyed?.()) return Promise.resolve(false);
  const { target, offset } = countryViewPose(view);
  return new Promise((resolve) => {
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
      offset,
      duration: options.duration ?? 3,
      complete: () => resolve(true),
      cancel: () => resolve(false),
    });
  });
}

/**
 * Default startup camera (no share link): open high over Bosnia and
 * Herzegovina, then ease down into the whole-country oblique view.
 * Same contract as {@link flyToAustin}: the returned function cancels the
 * pending or active startup flight, so teardown never sees a late move.
 * @param {Cesium.Viewer} viewer
 * @param {{lat: number, lon: number, range: number, heading: number, pitch: number}} [view]
 * @returns {Function}
 */
export function flyToStartupView(viewer, view = BIH_COUNTRY_VIEW) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(view.lon, view.lat, 6500000),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled || viewer.isDestroyed()) return;
    void flyToCountryView(viewer, view, { duration: 3.5 });
  }, 500);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}

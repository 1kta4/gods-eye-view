# Copernicus EMS Rapid Mapping — BiH activations

Bundled data for the `ba-emergencies` layer (src/layers/bosnia/emergencies.js).

| File | Content |
| --- | --- |
| `activations.json` | 9 activations covering BiH: code, dates, category, activation reason (upstream text), mapped area in BiH, AOI names, marker position |
| `EMSR922/854/797/770/665.geojson` | Merged, simplified delineations clipped to BiH (`kind`: `flood`, `fire`, `landslide`) and the BiH areas of interest (`kind: aoi`) |

Total size ≈ 250 KB.

## Sources (retrieved 2026-10-01)

- Activation metadata and layer list: `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=<CODE>`
- Vector layers: the "observedEventA" GeoJSON published per product on
  `https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com/...` (all products,
  including monitoring updates, merged as a maximum extent).
- Summary for older activations: `https://mapping.emergency.copernicus.eu/activations/api/activations/<CODE>/`

© European Union, Copernicus Emergency Management Service. Copernicus EMS
products are free and open for any use with attribution.

## Processing

Features were classified by `event_type` (5-Flood → flood, 8-Wildfire → fire,
6-Mass Movement → landslide; EMSR770 flood traces/erosion count as flood),
unioned per event and kind, clipped to the BiH outline (+~300 m), simplified
(flood 0.0002°, landslide 0.00008°, fire 0.0003°) and rounded to 5 decimals.
Areas in the card are computed from the merged geometry inside BiH.

## Gaps

- **EMSR087 (2014), EMSR358 (2019), EMSR572 (2022), EMSR616 (2022)**: the
  current portal returns "Authentication credentials were not provided" for
  their product lists and AOIs, so only the activation centroid and summary are
  bundled (marker + card, no polygons). EMSR616's centroid lies in Montenegro
  near Herceg Novi (the activation's own centroid).
- **EMSR922** (Aug 2026 wildfires) mapped mostly Montenegro; only the Krstac
  AOI touches BiH (≈40 ha burnt area inside BiH).
- The card notes for EMSR770 (27 deaths in the Jablanica/Konjic floods and
  debris flows) and EMSR087 are curated summaries, not upstream text.

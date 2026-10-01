# BiH railways and stations

Bundled data for the `ba-rail` layer (src/layers/bosnia/rail.js).

| File | Content |
| --- | --- |
| `lines.geojson` | `railway=rail|narrow_gauge|preserved|construction|disused|abandoned` ways (sidings, yards, spurs and crossovers dropped), grouped by status / electrified / narrow gauge / usage / name, line-merged and simplified (0.00012°) |
| `stations.geojson` | `railway=station|halt` nodes inside BiH (154), with entity and municipality from the boundaries layer |
| `zfbh-timetable.json` | ŽFBiH 2025/2026 passenger timetable (terminus times), used for station cards |

## Sources (retrieved 2026-10-01)

- OpenStreetMap via the Geofabrik extract `bosnia-herzegovina-260930.osm.pbf`
  (public Overpass instances returned 406/504 at build time). © OpenStreetMap
  contributors, **ODbL 1.0**.
- ŽFBiH timetable: <https://www.zfbh.ba/red-voznje/> (train numbers, termini,
  departure/arrival times and footnotes transcribed as static text).

## Notes

- Most OSM station nodes carry no `operator`; cards then show ŽFBiH or ŽRS
  inferred from the entity, marked "(by entity)". Štrpci on the Belgrade–Bar
  line is tagged as operated by Infrastruktura železnice Srbije.
- Abandoned trackbeds (old 760 mm "Ćiro" lines etc.) are drawn dashed; their
  OSM names are shown only when they describe the railway (many carry the name
  of the road later built on the trackbed).
- The public ŽFBiH timetable lists terminus times only; intermediate stations
  show which trains run on their line, not stop times. No ŽRS timetable is bundled.

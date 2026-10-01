# BiH airports, runways and airspace

Bundled data for the `ba-airports` layer (src/layers/bosnia/airports.js).
Regenerate with `node src/layers/bosnia/airports/build-data.mjs [AIRAC-date]`.

| File | Content |
| --- | --- |
| `airports.geojson` | 28 aerodromes/heliports with `iso_country=BA` (incl. LQSA, LQBK, LQMO, LQTZ, closed military fields) |
| `runways.geojson` | Runway centre-lines where OurAirports has both threshold coordinates (6) |
| `airspace.geojson` | AIRAC 2026-10-01: 4 CTRs, 4 TMAs, 1 prohibited, 3 restricted, 35 danger areas with lower/upper limits |

## Sources (retrieved 2026-10-01)

- OurAirports `airports.csv` and `runways.csv`
  (<https://davidmegginson.github.io/ourairports-data/>), **public domain**.
- BHANSA eAIP Bosnia and Herzegovina, AIRAC AMDT 009/2026 effective
  01 OCT 2026 (<https://eaip.bhansa.gov.ba/2026-10-01-AIRAC/html/>): ENR 2.1
  (TMAs), ENR 5.1 (P/R/D areas), AD 2.17 of LQSA/LQBK/LQMO/LQTZ (CTRs).

## Caveats

- **Not for navigation.** Static AIRAC snapshot; NOTAMs, activation times and
  later amendments are not reflected.
- "Along the FIR boundary" segments of TMAs follow the simplified national
  border from the boundaries layer (the Sarajevo FIR follows the state border).
- Limits are extruded in metres (FL × 100 ft; AGL lower limits drawn from the
  ellipsoid). The FIR and the upper/lower CTA (whole country, FL 660) are not
  drawn as volumes.

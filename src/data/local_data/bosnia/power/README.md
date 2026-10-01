# Power Grid (`ba-power`)

Built 2026-10-01 from the same OSM extract as the minefield layer (BiH,
2026-09-30T20:22:42Z, pyosmium), the WRI Global Power Plant Database v1.3,
and Wikidata.

## `plants.geojson` — 138 plants + 26 named dams

- **23 curated major plants.** These are the thermal plants (Tuzla, Kakanj,
  Gacko, Ugljevik, Stanari) and the large hydro plants (Jablanica,
  Grabovica, Salakovac, Mostar, Rama, Čapljina PHE, Peć-Mlini, Mostarsko
  Blato, Jajce I/II, Višegrad, Bočac, Trebinje I/II, Zvornik on the Drina
  border), plus wind (Podveležje, Mesihovina, Ivan Sedlo).
  - Position: the OSM `power=plant` feature, or Wikidata where OSM has none.
  - Capacity: OSM `plant:output:electricity`, cross-checked with WRI GPPD
    (GEODB-derived, ~2017) and Wikidata.
  - Operator: EPBiH, EPHZHB, ERS (incl. its Trebišnjica/Drina/Vrbas hydro
    and Gacko/Ugljevik mine-and-plant companies), EFT Stanari, EPS
    (Zvornik).
  - HE Dubrovnik (Plat) is fed from the Trebišnjica system but stands in
    Croatia, so it is not included.
- **3 unnamed OSM wind-turbine clusters.** These are shown as "Wind farm (n
  turbines mapped)". The Tomislavgrad–Livno area holds VE Jelovača (36 MW)
  and VE Ivovik (84 MW), and the Berkovići–Nevesinje area is where ERS's
  Hrgud project is. OSM does not name these turbines, so the layer does not
  claim which farm is which.
- **Other OSM `power=plant` features in BiH**, mostly small hydro and
  solar. Each has a fuel from `plant:source` and MW from
  `plant:output:electricity` when it is numeric.
  - Dropped: heat-only plants with no source tag, duplicates of a curated
    plant within ~1.5 km, and plants outside the BiH boundary.
- **Dams**: named OSM `waterway=dam` features inside BiH, with height when
  it is tagged.

## `grid.geojson` — 93 line features

OSM `power=line` with `voltage` ≥ 220 kV (22 × 400 kV, 71 × 220 kV after
merging by voltage+name). Simplified to 0.0008° (~80 m).

## Live (not bundled)

`/api/ba/power/live` (server/providers/bosnia/power.js) reads the ENTSO-E
Transparency Platform for bidding zone BA (10YBA-JPCC-----D):

- actual total load (A65)
- actual generation per type (A75)
- physical flows with HR, RS and ME, both directions (A11)

It needs `ENTSOE_API_TOKEN` (free registration). Results are cached for 20
minutes; stale data is served for up to 3 hours, marked as stale.

Licences:

- © OpenStreetMap contributors, ODbL 1.0
- WRI Global Power Plant Database, CC BY 4.0
- Wikidata, CC0
- ENTSO-E Transparency Platform data, under its terms of use

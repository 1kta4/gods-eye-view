# BiH entities, cantons and municipalities

Bundled data for the `ba-boundaries` layer (src/layers/bosnia/boundaries.js).

| File | Content |
| --- | --- |
| `municipalities.geojson` | 142 units (141 municipalities/cities + Brčko District): name (Latin), entity (`FBiH`/`RS`/`BD`), canton number (FBiH only), 2013 census population, area km², label point |
| `lines.geojson` | Boundary lines classified by level: `national`, `entity` (Inter-Entity Boundary Line and the Brčko District line), `canton`, `municipal`, derived from shared municipality edges so no line is drawn twice |
| `units.json` | Entity and canton summaries (population, area, label points) |

## Sources (retrieved 2026-10-01)

- **Geometry:** geoBoundaries gbOpen `BIH` ADM1/ADM2/ADM3, simplified release
  (<https://www.geoboundaries.org/api/current/gbOpen/BIH/ADM3/>), source
  Wikimedia Commons, **public domain**. Coordinates rounded to 5 decimals.
- **Population:** Agency for Statistics of BiH (BHAS), *Census of Population,
  Households and Dwellings in BiH, 2013 — Final results*, table 2.3
  (<https://www.popis.gov.ba/popis2013/doc/RezultatiPopisa_BS.pdf>). Totals
  reproduce the official figures: BiH 3,531,159; FBiH 2,219,220; RS 1,228,423;
  Brčko District 83,516; all ten canton totals match.
- **Area** is computed from the geometry (spherical), not the official cadastre.

## Processing notes

- Entity/canton membership comes from area overlap with ADM1/ADM2, with one
  correction: geoBoundaries ADM1 places **Istočni Stari Grad** inside FBiH; it
  is an RS municipality (BHAS lists it under RS) and is assigned to RS here.
- geoBoundaries mislabels the Višegrad polygon as "Republika Srpska" and uses
  older or English names (Ustiprača → Novo Goražde, Kupra na Uni → Krupa na Uni,
  Doboj East → Doboj Istok, Kupres (BiH) / Kupres → Kupres / Kupres (RS),
  Trnovo (BiH) / Trnovo (RS), Pale / Pale-Prača, Foča / Foča-Ustikolina). The
  build maps these to the BHAS census names.
- Stanari (an RS municipality since 2014) is not a separate unit in the 2013
  geometry or census; it is still part of Doboj.

## Neutrality and caveats

- The entity line is labelled **Inter-Entity Boundary Line** (Dayton 1995);
  Brčko District is shown as its own unit, not as part of either entity.
- The **Republika Srpska Institute of Statistics (RZS RS) disputes the BHAS
  methodology** for the 2013 census (treatment of non-resident persons) and
  publishes its own, lower RS figures. This layer uses the state-level BHAS
  final results; RS municipality numbers differ from RZS RS publications.

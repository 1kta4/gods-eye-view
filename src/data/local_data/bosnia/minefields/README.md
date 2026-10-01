# Mapped Minefields (`ba-minefields`)

> **INCOMPLETE community mapping, NOT official data.** Absence of a marking
> does NOT mean an area is safe. Official sources: BHMAC (www.bhmac.org) and
> EUFOR minefield maps (https://www.euforbih.org/index.php/en/bih-minefield-maps).

## `minefields.geojson`

192 features from an OpenStreetMap extract of BiH (replication timestamp
2026-09-30T20:22:42Z), filtered locally with pyosmium. The public Overpass
servers refused or timed out (HTTP 406/504) on 2026-10-01.

Selection: `hazard=minefield`, `hazard~mine|landmine|uxo|unexploded|explosive`,
`landuse=minefield`, `military=minefield|danger_area`, `danger=unexploded_ordnance`,
and name/description/note text matching mine warnings (`minsko`, `minirano`,
`mine`, …). False positives were removed by hand: shops called "Mina", the
peaks Sominsko katunište and Kreminsko brdo, the Tominska mosque, and the
Krupa ammunition depot (not a minefield).

| Kind | Count |
| --- | --- |
| `hazard=minefield` (181 polygons, 4 points) | 185 |
| `military=danger_area` | 4 |
| unexploded ordnance (`hazard`/`danger`) | 2 |
| mapped warning (a path tagged "area can have mines") | 1 |

Mapped area: **84.6 km²**, about 11% of the ~775 km² that BHMAC still
classes as suspected hazardous (Jan 2026). Most features (≈170) are tagged
`description=Minski sumnjivo područje` with `source=euforbih.org` (EUFOR
maps traced by mappers). Coverage is concentrated in Herzegovina and
central/south-eastern BiH (about 97 features at 43–44°N 18–19°E). Large
suspected areas elsewhere, notably the north and north-west, are almost
unmapped.

Geometry: simplified with a tolerance of 0.00002° (~2 m) and rounded to 6
decimals. Licence: © OpenStreetMap contributors, ODbL 1.0.

## `suspected_area_2025.json`

Suspected hazardous area by canton and entity, January 2025 (822.87 km²
total), from Table 1 of the _Mine Action Activity Plan in Bosnia and
Herzegovina 2025–2026_ (BHMAC). The plan was submitted with BiH's APMBC
Article 5 extension request:
https://www.apminebanconvention.org/fileadmin/_APMBC-DOCUMENTS/Meetings/2025/22MSP-Bosnia-and-Herzegovina-Art5-ExtReq-Work-Plan.pdf

There are no municipality-level figures in that public report. The layer
shows this table in the warning banner. The headline figure in the warning
(~775 km², Jan 2026) is the newer BHMAC estimate.

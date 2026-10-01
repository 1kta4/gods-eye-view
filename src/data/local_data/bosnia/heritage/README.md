# Heritage Sites (`ba-heritage`)

`heritage.geojson` — 564 points, built 2026-10-01.

| Tier | Count | Source |
| --- | --- | --- |
| `unesco` (gold) | 24 | UNESCO World Heritage components in BiH |
| `national` (white) | 540 | National Monuments of BiH (KONS) on Wikidata |

**UNESCO components** (whc.unesco.org/en/statesparties/ba):

- Old Bridge Area of the Old City of Mostar (946, 2005)
- Mehmed Paša Sokolović Bridge in Višegrad (1260, 2007)
- Stećci Medieval Tombstone Graveyards (1504, 2016). All 20 BiH components,
  1504-001…020: Radimlja, Grčka glavica (Biskup), Kalufi (Krekovi), Borak
  (Burati), Maculje, Dugo polje (Blidinje), Gvozno, Grebnice (Radmilovića
  Dubrava), Bijača, Olovci, Mramor (Musići), Kučarin (Hrančići), Boljuni,
  Dolovi (Umoljani), Luburića polje, Potkuk (Bitunja), Bečani, Mramor
  (Vrbica), Čengića Bara, Ravanjska vrata. The other 8 components are in
  HR/ME/RS. "Mramorje Pavlovac" and "Grčko groblje (Žabljak)" are not BiH
  components.
- Ancient and Primeval Beech Forests of the Carpathians and Other Regions of
  Europe (1133): BiH component Prašuma Janj (1133quinquies-072, added 2021).
- Vjetrenica Cave, Ravno (1673, inscribed 2024).

Positions come from the UNESCO component table (as reproduced on
en.wikipedia "Stećak"). Wikidata is used where it has a better point (Mramor,
Musići: the table's 45°06′ latitude is a typo). Vjetrenica uses Wikidata.

**National monuments**: Wikidata items with `P1435` (heritage designation) =
`Q12637954` "National Monuments of Bosnia and Herzegovina" (no end date) or
with a KONS ID (`P8039`), plus `P17`=BiH and coordinates. Fields: label
(bs → hr → sr → en), English label, `P31` type, `P131` place, `P18` image,
KONS ID, and Wikipedia link (bs → sh → hr → sr → en). KONS has designated
more monuments than Wikidata covers, so this is a subset.

SPARQL used (endpoint https://query.wikidata.org/sparql; a second pass
selected `wdt:P8039` items lacking the designation statement):

```sparql
SELECT ?item ?coord ?bs ?hr ?sr ?en ?image ?wbs ?wen ?wsh ?wsr ?wde ?adminLabel ?typeLabel ?designation ?kons WHERE {
  VALUES ?designation { wd:Q12637954 wd:Q9259 wd:Q43113623 wd:Q1459900 }
  ?item p:P1435 ?st .
  ?st ps:P1435 ?designation .
  FILTER NOT EXISTS { ?st pq:P582 ?ended }
  ?item wdt:P17 wd:Q225 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item rdfs:label ?bs FILTER(LANG(?bs) = "bs") }
  OPTIONAL { ?item rdfs:label ?hr FILTER(LANG(?hr) = "hr") }
  OPTIONAL { ?item rdfs:label ?sr FILTER(LANG(?sr) = "sr") }
  OPTIONAL { ?item rdfs:label ?sh FILTER(LANG(?sh) = "sh") }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P131 ?admin }
  OPTIONAL { ?item wdt:P31 ?type }
  OPTIONAL { ?item wdt:P8039 ?kons }
  OPTIONAL { ?wbs schema:about ?item ; schema:isPartOf <https://bs.wikipedia.org/> }
  OPTIONAL { ?wen schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?wsh schema:about ?item ; schema:isPartOf <https://sh.wikipedia.org/> }
  OPTIONAL { ?wsr schema:about ?item ; schema:isPartOf <https://sr.wikipedia.org/> }
  OPTIONAL { ?wde schema:about ?item ; schema:isPartOf <https://hr.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "bs,hr,sr,sh,en". ?admin rdfs:label ?adminLabel . ?type rdfs:label ?typeLabel . }
}
```

Licences: Wikidata CC0. Designations by the Commission to Preserve National
Monuments of Bosnia and Herzegovina (KONS, kons.gov.ba). UNESCO list data
© UNESCO World Heritage Centre. Images are loaded on demand from Wikimedia
Commons; each file has its own licence (linked from the card).

# Bosnia and Herzegovina roads data

## border_crossings.json

47 road border crossings of Bosnia and Herzegovina, used by the
`ba-border-crossings` layer (`src/layers/bosnia/borderCrossings.js`).

- **List and names:** the BIHAMK border-crossing report
  (<https://bihamk.ba/spi/stanje-na-cesti-u-bih/granicni-prijelazi>), fetched
  2026-10-01. `key` is the normalised BIHAMK name and is what the live report
  is joined on.
- **Coordinates:** the nearest OpenStreetMap `barrier=border_control` node
  within 1.5 km of BIHAMK's own map marker (`coordSource: "osm"`), else
  BIHAMK's marker (`coordSource: "bihamk"`). OSM extract via Overpass
  (`area["ISO3166-1"="BA"][admin_level=2]`), 2026-10-01.
  © OpenStreetMap contributors, ODbL 1.0.
- **Neighbouring crossing names:** OSM names and public Croatian/Serbian/
  Montenegrin crossing lists; `null` where not confidently known.
- **elevationM:** Open-Meteo elevation API (Copernicus DEM GLO-90), 2026-10-01.
- **outwardBearingDeg:** bearing from central Bosnia (44.17 N, 17.78 E) to the
  crossing — a rough "towards the neighbour" direction used to aim camera
  poses.
- **cameras:** ids of the BiH CCTV pack cameras at that crossing
  (`config/cctv_sources.bosnia.json`).

Live wait times are not stored here; they are scraped server-side from BIHAMK
by `server/providers/bosnia/roads.js` (`/api/ba/border-crossings`, 10 min
cache).

## CCTV pack (config/cctv_sources.bosnia.json)

45 still-image cameras verified live on 2026-10-01:

- BIHAMK (`https://video-nadzor.bihamk.ba/videosurveillence/<NAME>.jpg`),
  listed at <https://bihamk.ba/spi/kamere>: 5 road cameras (Sarajevo
  Skenderija, Stupska petlja, Briješće; Makljen; Tuzla Siporex) and 9
  border-crossing cameras.
- AMS RS (`https://gp.satwork.net/AMSRS_NN_GP_XXNN/slika.jpg`), listed at
  <https://ams-rs.com/en/granicni-prelazi/>: 31 entry/exit cameras at 17
  crossings.

Excluded as dead on 2026-10-01: BIHAMK `SEPAK` (frame frozen since
2026-09-11, marked "Nije u funkciji"), AMS RS `01_GP_GR01/GR02` (frozen since
2026-07-08; the site now shows `17_GP_CA01/CA02` for Gradiška), `03_GP_TB01`
(frozen since 2024-12-18), `12_GP_KL02` (empty body), `13_GP_SP02` (404).

Camera headings are estimates (`headingConfidence: "low"`) except where
noted; entry cameras face outward, exit cameras face inward.

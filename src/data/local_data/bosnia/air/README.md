# Bosnia air-quality station coordinates

`fhmz-stations.json` maps each station of the FHMZ hourly AQI table
(https://www.fhmzbih.gov.ba/latinica/ZRAK/AQI-satne.php, keyed by its
`ams*.php` detail page) to a display name and coordinates. FHMZ publishes no
coordinates, so they are hard-coded here.

- Source: EEA/Eionet e-Reporting station metadata, dataflow D, Bosnia and
  Herzegovina 2021 (https://cdr.eionet.europa.eu/ba/eu/aqd/d/envyyhlzg/),
  matched by station name; `eoi` holds the EEA station code.
- Entries with `"approximate": true` are not in that delivery under a
  matching name (Saraj Polje, Kakanj Centar/Općina, Vitez, Mostar Bijeli
  Brijeg/Kampus, Tuzla BKC) and were placed at the named neighbourhood or
  institution using OpenStreetMap Nominatim (© OpenStreetMap contributors,
  ODbL). Treat them as within ~1 km.
- Retrieved: 2026-10-01.

RHMZ RS (https://www.rhmzrs.com/data/feeds/EkoPodaci.json) and
Sensor.Community publish their own coordinates and need no table.

# Bosnia Meteoalarm warning regions

`meteoalarm-regions.geojson` holds the ten Meteoalarm warning regions for
Bosnia and Herzegovina (EMMA_ID BA001–BA010: Bihać, Prijedor, Banja Luka,
Tuzla, Livno, Sarajevo, Višegrad, Mostar, Foča, Trebinje), used to draw the
areas named by `cap:geocode` in the Meteoalarm Atom feed.

- Source: MeteoAlarm geocodes as shipped in the MIT-licensed `meteoalarm`
  Python package (`src/meteoalarm/assets/geocodes.json`,
  https://github.com/NiklasJordan/meteoalarm), originally published by
  MeteoAlarm (EUMETNET). Warning content itself is CC BY 4.0 (MeteoAlarm).
- Processing: kept only `country == "BA"` features, rounded coordinates to
  4 decimals, added local display names with diacritics (`name`); the
  upstream upper-case name is kept as `meteoalarmName`.
- Retrieved: 2026-10-01.

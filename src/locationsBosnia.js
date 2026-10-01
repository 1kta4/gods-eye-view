/**
 * Bosnia and Herzegovina destinations for the bundled CITY_POIS table.
 *
 * Same row shape as the rest of CITY_POIS (see src/locations.js): `alt` is the
 * camera RANGE from the target in metres, `heading`/`pitch` are degrees, and
 * `groundElevation` is an ellipsoidal fallback (orthometric height + ~45 m of
 * geoid undulation over BiH) used until terrain or 3D tiles report the ground.
 *
 * Every coordinate was checked against OpenStreetMap Nominatim on 2026-10-01.
 * `aliases` are extra exact names the offline preset geocoder answers for
 * (diacritics are folded there, so "Bascarsija" already finds "Baščaršija").
 */

/** A rectangle around a point, in the `viewBounds` shape. */
function around(lat, lon, dLat, dLon = dLat * 1.4) {
  const round = (value) => Math.round(value * 1e4) / 1e4;
  return {
    southwest: { lat: round(lat - dLat), lng: round(lon - dLon) },
    northeast: { lat: round(lat + dLat), lng: round(lon + dLon) },
  };
}

/** A town overview POI: a high oblique frame over the centre. */
function townCentre(name, lat, lon, extra = {}) {
  return {
    name,
    lat,
    lon,
    alt: 2600,
    pitch: -32,
    heading: 0,
    buildingHeight: 20,
    ...extra,
  };
}

export const BIH_CITY_POIS = {
  sarajevo: {
    name: 'Sarajevo',
    aliases: ['Sarajevu'],
    groundElevation: 565,
    viewBounds: {
      southwest: { lat: 43.7, lng: 18.24 },
      northeast: { lat: 43.9, lng: 18.6 },
    },
    pois: [
      {
        // Looking east up the Miljacka valley onto the old bazaar.
        name: 'Baščaršija',
        aliases: ['Sebilj', 'Sebilj fountain', 'Bascarsija Sarajevo'],
        lat: 43.8597,
        lon: 18.4312,
        alt: 1500,
        pitch: -22,
        heading: 80,
        buildingHeight: 15,
      },
      {
        name: 'Vijećnica',
        aliases: ['Sarajevo City Hall', 'City Hall Sarajevo'],
        lat: 43.8592,
        lon: 18.4333,
        alt: 450,
        pitch: -25,
        heading: 120,
        buildingHeight: 20,
      },
      {
        name: 'Latinska ćuprija',
        aliases: ['Latin Bridge'],
        lat: 43.8576,
        lon: 18.4289,
        alt: 350,
        pitch: -25,
        heading: 60,
        buildingHeight: 5,
      },
      {
        name: 'Avaz Twist Tower',
        lat: 43.8611,
        lon: 18.402,
        alt: 700,
        pitch: -18,
        heading: 300,
        buildingHeight: 85,
      },
      {
        name: 'Trebević bobsleigh track',
        aliases: ['Trebević bob staza', 'Sarajevo bobsleigh track'],
        lat: 43.8411,
        lon: 18.4514,
        alt: 700,
        pitch: -35,
        heading: 160,
        buildingHeight: 5,
      },
      {
        name: 'Kovači',
        aliases: ['Kovači cemetery', 'Šehidsko mezarje Kovači'],
        lat: 43.8606,
        lon: 18.4324,
        alt: 450,
        pitch: -30,
        heading: 20,
        buildingHeight: 5,
      },
      {
        name: 'Koševo Stadium',
        aliases: [
          'Koševo',
          'Asim Ferhatović Hase Stadium',
          'Stadion Asim Ferhatović Hase',
        ],
        lat: 43.8737,
        lon: 18.4085,
        alt: 650,
        pitch: -32,
        heading: 0,
        buildingHeight: 15,
      },
      {
        name: 'Sarajevo International Airport',
        aliases: ['Sarajevo Airport', 'SJJ', 'Aerodrom Sarajevo'],
        lat: 43.8254,
        lon: 18.3331,
        alt: 2200,
        pitch: -30,
        heading: 110,
        buildingHeight: 10,
      },
      {
        name: 'Tunel spasa',
        aliases: ['Sarajevo War Tunnel', 'Tunnel of Hope'],
        lat: 43.8246,
        lon: 18.3408,
        alt: 400,
        pitch: -30,
        heading: 0,
        buildingHeight: 5,
      },
      {
        name: 'Vrelo Bosne',
        lat: 43.822,
        lon: 18.2694,
        alt: 700,
        pitch: -32,
        heading: 220,
        buildingHeight: 5,
      },
      {
        name: 'Jahorina',
        aliases: ['Jahorina ski resort'],
        lat: 43.7383,
        lon: 18.562,
        alt: 2500,
        pitch: -25,
        heading: 150,
        buildingHeight: 10,
      },
      {
        name: 'Bjelašnica',
        aliases: ['Bjelašnica ski resort', 'Babin Do'],
        lat: 43.7167,
        lon: 18.2832,
        alt: 2500,
        pitch: -25,
        heading: 220,
        buildingHeight: 10,
      },
    ],
  },
  mostar: {
    name: 'Mostar',
    groundElevation: 105,
    viewBounds: {
      southwest: { lat: 43.1, lng: 17.55 },
      northeast: { lat: 43.38, lng: 17.95 },
    },
    pois: [
      {
        // Over the Neretva from the south, the arch side-on; high enough to
        // clear the gorge walls the terrain mesh draws around the river.
        name: 'Stari Most',
        aliases: ['Old Bridge Mostar', 'Mostar Bridge', 'Stari most Mostar'],
        lat: 43.3373,
        lon: 17.815,
        alt: 750,
        pitch: -30,
        heading: 355,
        buildingHeight: 15,
      },
      {
        name: 'Kriva ćuprija',
        aliases: ['Crooked Bridge'],
        lat: 43.3368,
        lon: 17.8131,
        alt: 300,
        pitch: -28,
        heading: 30,
        buildingHeight: 5,
      },
      {
        name: 'Partisan Memorial Cemetery',
        aliases: ['Partizansko groblje'],
        lat: 43.3418,
        lon: 17.7968,
        alt: 500,
        pitch: -32,
        heading: 270,
        buildingHeight: 5,
      },
      {
        name: 'Blagaj Tekke',
        aliases: ['Blagaj', 'Tekija Blagaj', 'Blagajska tekija'],
        lat: 43.2573,
        lon: 17.9033,
        alt: 450,
        pitch: -20,
        heading: 90,
        buildingHeight: 10,
      },
      {
        name: 'Počitelj',
        lat: 43.1346,
        lon: 17.732,
        alt: 700,
        pitch: -22,
        heading: 90,
        buildingHeight: 20,
      },
      {
        name: 'Kravica waterfalls',
        aliases: ['Kravica', 'Vodopad Kravica', 'Slapovi Kravica'],
        lat: 43.1561,
        lon: 17.6079,
        alt: 450,
        pitch: -28,
        heading: 300,
        buildingHeight: 5,
      },
    ],
  },
  banjaluka: {
    name: 'Banja Luka',
    aliases: ['Banjaluka'],
    groundElevation: 210,
    viewBounds: around(44.7721, 17.1918, 0.05),
    pois: [
      {
        // The fortress walls on the Vrbas, looking north-east over the centre.
        name: 'Kastel',
        aliases: ['Kastel fortress', 'Tvrđava Kastel'],
        lat: 44.7665,
        lon: 17.1909,
        alt: 800,
        pitch: -30,
        heading: 30,
        buildingHeight: 10,
      },
      {
        name: 'Ferhadija Mosque',
        aliases: ['Ferhadija', 'Ferhadija džamija'],
        lat: 44.7674,
        lon: 17.1873,
        alt: 400,
        pitch: -25,
        heading: 90,
        buildingHeight: 20,
      },
      {
        name: 'Cathedral of Christ the Saviour',
        aliases: ['Saborni hram Hrista Spasitelja', 'Hram Hrista Spasitelja'],
        lat: 44.7722,
        lon: 17.1916,
        alt: 450,
        pitch: -25,
        heading: 200,
        buildingHeight: 25,
      },
    ],
  },
  tuzla: {
    name: 'Tuzla',
    groundElevation: 285,
    viewBounds: around(44.5393, 18.6749, 0.04),
    pois: [
      townCentre('Trg slobode', 44.5393, 18.6746, { alt: 700, pitch: -28 }),
      {
        name: 'Pannonian Lakes',
        aliases: ['Panonska jezera'],
        lat: 44.5395,
        lon: 18.6801,
        alt: 600,
        pitch: -30,
        heading: 60,
        buildingHeight: 5,
      },
    ],
  },
  zenica: {
    name: 'Zenica',
    groundElevation: 360,
    viewBounds: around(44.1998, 17.9093, 0.04),
    pois: [townCentre('Trg Alije Izetbegovića', 44.1991, 17.9111)],
  },
  bihac: {
    name: 'Bihać',
    groundElevation: 275,
    viewBounds: {
      southwest: { lat: 44.45, lng: 15.8 },
      northeast: { lat: 44.86, lng: 16.2 },
    },
    pois: [
      townCentre('Fethija Mosque', 44.8161, 15.87, {
        aliases: ['Fethija džamija'],
        alt: 900,
      }),
      {
        name: 'Štrbački buk',
        aliases: ['Una National Park', 'Nacionalni park Una'],
        lat: 44.6562,
        lon: 16.0099,
        alt: 600,
        pitch: -25,
        heading: 120,
        buildingHeight: 5,
      },
      {
        name: 'Martin Brod',
        lat: 44.4883,
        lon: 16.1422,
        alt: 900,
        pitch: -28,
        heading: 30,
        buildingHeight: 5,
      },
    ],
  },
  bijeljina: {
    name: 'Bijeljina',
    groundElevation: 135,
    viewBounds: around(44.7568, 19.2157, 0.04),
    pois: [townCentre('Trg kralja Petra I', 44.7572, 19.2162)],
  },
  brcko: {
    name: 'Brčko',
    groundElevation: 140,
    viewBounds: around(44.8771, 18.8095, 0.04),
    pois: [
      townCentre('Brčko City Hall', 44.8782, 18.8097, {
        aliases: ['Gradska vijećnica Brčko'],
        alt: 800,
      }),
    ],
  },
  prijedor: {
    name: 'Prijedor',
    groundElevation: 180,
    viewBounds: {
      southwest: { lat: 44.94, lng: 16.66 },
      northeast: { lat: 45.05, lng: 16.95 },
    },
    pois: [
      townCentre('Prijedor centre', 44.9801, 16.7124),
      {
        name: 'Mrakovica',
        aliases: ['Kozara', 'Kozara National Park'],
        lat: 45.0138,
        lon: 16.9091,
        alt: 1500,
        pitch: -25,
        heading: 0,
        buildingHeight: 20,
      },
    ],
  },
  doboj: {
    name: 'Doboj',
    groundElevation: 190,
    viewBounds: around(44.7325, 18.085, 0.04),
    pois: [
      {
        name: 'Doboj Fortress',
        aliases: ['Gradina Doboj', 'Tvrđava Gradina'],
        lat: 44.7374,
        lon: 18.0876,
        alt: 700,
        pitch: -28,
        heading: 30,
        buildingHeight: 10,
      },
    ],
  },
  trebinje: {
    name: 'Trebinje',
    groundElevation: 320,
    viewBounds: around(42.7115, 18.3447, 0.04),
    pois: [
      {
        name: 'Arslanagić Bridge',
        aliases: ['Arslanagića most', 'Perovića most'],
        lat: 42.7147,
        lon: 18.354,
        alt: 450,
        pitch: -20,
        heading: 20,
        buildingHeight: 5,
      },
      {
        name: 'Hercegovačka Gračanica',
        lat: 42.7107,
        lon: 18.36,
        alt: 500,
        pitch: -25,
        heading: 90,
        buildingHeight: 15,
      },
      townCentre('Trebinje old town', 42.7115, 18.3447, { alt: 900 }),
    ],
  },
  travnik: {
    name: 'Travnik',
    groundElevation: 560,
    viewBounds: {
      southwest: { lat: 44.19, lng: 17.54 },
      northeast: { lat: 44.34, lng: 17.71 },
    },
    pois: [
      {
        name: 'Travnik Fortress',
        aliases: ['Travnička tvrđava', 'Stari grad Travnik'],
        lat: 44.23,
        lon: 17.6709,
        alt: 700,
        pitch: -25,
        heading: 270,
        buildingHeight: 10,
      },
      {
        name: 'Vlašić',
        aliases: ['Babanovac', 'Vlašić ski resort'],
        lat: 44.3133,
        lon: 17.5732,
        alt: 2500,
        pitch: -25,
        heading: 330,
        buildingHeight: 10,
      },
    ],
  },
  gorazde: {
    name: 'Goražde',
    groundElevation: 390,
    viewBounds: around(43.6684, 18.9759, 0.04),
    pois: [townCentre('Goražde on the Drina', 43.6684, 18.9759)],
  },
  livno: {
    name: 'Livno',
    groundElevation: 775,
    viewBounds: around(43.8259, 17.0042, 0.04),
    pois: [townCentre('Livno old town', 43.8314, 17.008)],
  },
  neum: {
    name: 'Neum',
    groundElevation: 60,
    viewBounds: {
      southwest: { lat: 42.88, lng: 17.55 },
      northeast: { lat: 43.08, lng: 17.82 },
    },
    pois: [
      townCentre('Neum bay', 42.9259, 17.6157, { heading: 230, alt: 2200 }),
      {
        name: 'Hutovo blato',
        aliases: ['Hutovo Blato Nature Park'],
        lat: 43.0503,
        lon: 17.7802,
        alt: 3500,
        pitch: -30,
        heading: 0,
        buildingHeight: 5,
      },
    ],
  },
  jajce: {
    name: 'Jajce',
    groundElevation: 405,
    viewBounds: around(44.3397, 17.2712, 0.03, 0.06),
    pois: [
      {
        name: 'Pliva Waterfall',
        aliases: ['Pliva waterfall Jajce', 'Vodopad Plive', 'Slapovi Plive'],
        lat: 44.3377,
        lon: 17.2705,
        alt: 450,
        pitch: -18,
        heading: 10,
        buildingHeight: 10,
      },
      {
        name: 'Jajce Fortress',
        aliases: ['Jajačka tvrđava', 'Tvrđava Jajce'],
        lat: 44.3407,
        lon: 17.2692,
        alt: 500,
        pitch: -28,
        heading: 300,
        buildingHeight: 10,
      },
      {
        name: 'Pliva watermills',
        aliases: ['Mlinčići', 'Plivski mlinčići'],
        lat: 44.3469,
        lon: 17.2267,
        alt: 450,
        pitch: -28,
        heading: 270,
        buildingHeight: 5,
      },
    ],
  },
  konjic: {
    name: 'Konjic',
    groundElevation: 315,
    viewBounds: around(43.6544, 17.9607, 0.04),
    pois: [townCentre('Konjic on the Neretva', 43.6544, 17.9607)],
  },
  visegrad: {
    name: 'Višegrad',
    groundElevation: 395,
    viewBounds: around(43.7864, 19.2941, 0.03),
    pois: [
      {
        name: 'Mehmed Paša Sokolović Bridge',
        aliases: [
          'Višegrad Bridge',
          'Most Mehmed-paše Sokolovića',
          'Na Drini ćuprija',
        ],
        lat: 43.7826,
        lon: 19.2875,
        alt: 550,
        pitch: -18,
        heading: 20,
        buildingHeight: 10,
      },
      {
        name: 'Andrićgrad',
        lat: 43.7861,
        lon: 19.294,
        alt: 450,
        pitch: -28,
        heading: 90,
        buildingHeight: 15,
      },
    ],
  },
  srebrenica: {
    name: 'Srebrenica',
    groundElevation: 415,
    viewBounds: {
      southwest: { lat: 44.08, lng: 19.25 },
      northeast: { lat: 44.18, lng: 19.34 },
    },
    pois: [
      {
        name: 'Srebrenica-Potočari Memorial',
        aliases: [
          'Potočari Memorial',
          'Potočari',
          'Srebrenica Memorial',
          'Memorijalni centar Srebrenica-Potočari',
        ],
        lat: 44.1571,
        lon: 19.3034,
        alt: 700,
        pitch: -30,
        heading: 330,
        buildingHeight: 5,
      },
      townCentre('Srebrenica town', 44.1063, 19.2953),
    ],
  },
  foca: {
    name: 'Foča',
    groundElevation: 445,
    viewBounds: {
      southwest: { lat: 43.27, lng: 18.62 },
      northeast: { lat: 43.55, lng: 18.83 },
    },
    pois: [
      townCentre('Aladža Mosque', 43.5054, 18.7798, {
        aliases: ['Aladža džamija'],
        alt: 600,
        pitch: -25,
      }),
      {
        name: 'Tjentište Memorial',
        aliases: [
          'Tjentište',
          'Valley of Heroes',
          'Dolina heroja',
          'Sutjeska',
          'Sutjeska National Park',
          'Spomenik Bitka na Sutjesci',
        ],
        lat: 43.3462,
        lon: 18.6868,
        alt: 650,
        pitch: -22,
        heading: 30,
        buildingHeight: 15,
      },
      {
        name: 'Perućica',
        aliases: ['Perućica forest', 'Prašuma Perućica'],
        lat: 43.3015,
        lon: 18.7012,
        alt: 3500,
        pitch: -30,
        heading: 180,
        buildingHeight: 10,
      },
    ],
  },
  cazin: {
    name: 'Cazin',
    groundElevation: 395,
    viewBounds: {
      southwest: { lat: 44.88, lng: 15.89 },
      northeast: { lat: 45.0, lng: 16.0 },
    },
    pois: [
      townCentre('Cazin centre', 44.9665, 15.9423),
      {
        name: 'Ostrožac Fortress',
        aliases: ['Tvrđava Ostrožac', 'Ostrožac'],
        lat: 44.9053,
        lon: 15.9369,
        alt: 500,
        pitch: -25,
        heading: 90,
        buildingHeight: 15,
      },
    ],
  },
  zvornik: {
    name: 'Zvornik',
    groundElevation: 195,
    viewBounds: around(44.3854, 19.1028, 0.03),
    pois: [
      townCentre('Zvornik on the Drina', 44.3854, 19.1028, { heading: 200 }),
      {
        name: 'Đurđev grad',
        aliases: ['Zvornik Fortress', 'Kula Grad'],
        lat: 44.3755,
        lon: 19.0965,
        alt: 600,
        pitch: -28,
        heading: 60,
        buildingHeight: 10,
      },
    ],
  },
};

/**
 * Whole-country framing: centred just north of 43.9N 17.7E, every border in
 * view, with a slight oblique tilt looking north. The tilt is kept shallow on
 * purpose: the HUD reads the camera's own sub-point, and at -80° from 650 km
 * that point stays inside BiH (≈43.0N, over Herzegovina), so the startup
 * summary says BOSNIA AND HERZEGOVINA / NEAR … rather than the Adriatic.
 * Used for the startup view and the first-run Bosnia & Herzegovina mission.
 */
export const BIH_COUNTRY_VIEW = Object.freeze({
  lat: 44.0,
  lon: 17.7,
  range: 650000,
  heading: 0,
  pitch: -80,
});

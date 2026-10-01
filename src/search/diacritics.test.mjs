import test from 'node:test';
import assert from 'node:assert/strict';
import { foldDiacritics, foldedSpellings } from './diacritics.js';
import { createPresetGeocoder } from './presetGeocoder.js';
import { CITY_POIS } from '../locations.js';

test('Bosnian letters fold to what a plain keyboard types', () => {
  assert.equal(foldDiacritics('Baščaršija'), 'bascarsija');
  assert.equal(foldDiacritics('BRČKO'), 'brcko');
  assert.equal(foldDiacritics('Bihać'), 'bihac');
  assert.equal(foldDiacritics('Goražde'), 'gorazde');
  assert.equal(foldDiacritics('Đurđev grad'), 'djurdjev grad');
  assert.equal(foldDiacritics('Ülemiste'), 'ulemiste');
  assert.equal(foldDiacritics(null), '');
});

test('đ is reachable as both "dj" and "d"; other names have one spelling', () => {
  assert.deepEqual(foldedSpellings('Đurđev grad'), [
    'djurdjev grad',
    'durdev grad',
  ]);
  assert.deepEqual(foldedSpellings('Višegrad'), ['visegrad']);
});

test('the real bundle answers BiH names offline, with or without diacritics', async () => {
  const geocoder = createPresetGeocoder({ presets: CITY_POIS });
  const cases = [
    ['Sarajevo', 'Sarajevo', ['locality']],
    ['sarajevo', 'Sarajevo', ['locality']],
    ['Banjaluka', 'Banja Luka', ['locality']],
    ['Brcko', 'Brčko', ['locality']],
    ['Bihac', 'Bihać', ['locality']],
    ['Visegrad', 'Višegrad', ['locality']],
    ['Stari Most', 'Stari Most, Mostar', ['point_of_interest']],
    ['stari most', 'Stari Most, Mostar', ['point_of_interest']],
    ['Bascarsija', 'Baščaršija, Sarajevo', ['point_of_interest']],
    ['Baščaršija', 'Baščaršija, Sarajevo', ['point_of_interest']],
    ['Sebilj', 'Baščaršija, Sarajevo', ['point_of_interest']],
    ['Vijecnica', 'Vijećnica, Sarajevo', ['point_of_interest']],
    ['Latinska cuprija', 'Latinska ćuprija, Sarajevo', ['point_of_interest']],
    ['Tunel spasa', 'Tunel spasa, Sarajevo', ['point_of_interest']],
    ['Strbacki buk', 'Štrbački buk, Bihać', ['point_of_interest']],
    ['Durdev grad', 'Đurđev grad, Zvornik', ['point_of_interest']],
    ['Djurdjev grad', 'Đurđev grad, Zvornik', ['point_of_interest']],
    ['Blagaj Tekke', 'Blagaj Tekke, Mostar', ['point_of_interest']],
    ['Kravica', 'Kravica waterfalls, Mostar', ['point_of_interest']],
    [
      'Potocari',
      'Srebrenica-Potočari Memorial, Srebrenica',
      ['point_of_interest'],
    ],
  ];
  for (const [query, label, types] of cases) {
    const { place, answered } = await geocoder.geocode(query);
    assert.equal(answered, true);
    assert.ok(place, `${query} must resolve offline`);
    assert.equal(place.label, label, query);
    assert.deepEqual(place.types, types, query);
  }
  // Exactness is unchanged: partial names still go to the network geocoders.
  for (const query of ['Sara', 'Stari', 'most', 'bascarsija sarajevo square']) {
    assert.equal((await geocoder.geocode(query)).place, null, query);
  }
  // The existing destinations still answer.
  assert.equal(
    (await geocoder.geocode('Ulemiste')).place?.label,
    'Ülemiste, Tallinn',
  );
  assert.equal((await geocoder.geocode('austin')).place?.label, 'Austin');
});

/**
 * Letters that Unicode decomposition does not reduce to a base letter plus a
 * combining mark, mapped to the spelling people type on a plain keyboard.
 * `đ` is the one Bosnian/Croatian/Serbian letter in that set; "dj" is how it
 * is conventionally written without diacritics (Đurđev grad → Djurdjev grad).
 */
const STROKED_LETTERS = Object.freeze({
  đ: 'dj',
  ø: 'o',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ı: 'i',
});

/** Lowercase and strip accents: "Baščaršija" → "bascarsija". */
export function foldDiacritics(value, strokedLetters = STROKED_LETTERS) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[đøłßæœı]/gu, (letter) => strokedLetters[letter] ?? letter)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '');
}

/**
 * Every folded spelling a name should be found under. A name with `đ` is
 * reachable both as "dj" and as plain "d" (Goražde-style Latin keyboards often
 * drop it to "d"); everything else has exactly one folded form.
 * @param {string} value
 * @returns {string[]}
 */
export function foldedSpellings(value) {
  const primary = foldDiacritics(value);
  if (!/đ/iu.test(String(value ?? ''))) return [primary];
  const plainD = foldDiacritics(value, { ...STROKED_LETTERS, đ: 'd' });
  return primary === plainD ? [primary] : [primary, plainD];
}

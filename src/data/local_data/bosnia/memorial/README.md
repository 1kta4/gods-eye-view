# War Memory 1992–95 (`ba-memorial`)

`memorial.json` — 35 curated reference points: memorials, former detention
camps and sites of crimes documented by international and domestic courts.
Compiled 2026-10-01. Off by default.

## Sourcing principles

1. **Court findings first.** Each description summarises what a judgment
   established — ICTY/IRMCT trial or appeal judgements, the ICJ (_Bosnia and
   Herzegovina v. Serbia and Montenegro_, 2007), or the Court of BiH — or
   simply describes a memorial. Where an accused was acquitted but the chamber
   found the crime occurred (e.g. Grabovica and Uzdol in _Halilović_), the
   text says so.
2. **Every entry links its sources** (ICTY case pages, IRMCT, ICJ, the
   memorial's own site, ICMP's _Geography of Genocide_
   <https://srebrenica.icmp.int/>, FAMA _Survival Map_
   <https://www.famacollection.org/interact/survival-map>, UNSA _Shelling of
   Sarajevo_ <https://iziz.unsa.ba/>). An entry without an https source is
   rejected by the layer (`normaliseMemorialSite`).
3. **Neutral wording.** Perpetrator forces are named as the courts named them
   (VRS, HVO, ARBiH, police, paramilitaries); no adjectives beyond the
   findings. Victims of all communities are included where documented.
4. **No victim-level data.** No names, lists or individual records are
   scraped or bundled. Numbers are the rounded figures used in the cited
   judgments or memorial descriptions.
5. **Approximate positions are flagged.** `"approximate": true` marks a
   settlement-level point (drawn as an open ring); otherwise the point is the
   memorial/site location from Wikidata.

Coordinates: Wikidata (CC0) where available, otherwise settlement centroids.
Text: written for this project; the linked sources carry the full record.

Corrections should cite a judgment paragraph or an official memorial source.

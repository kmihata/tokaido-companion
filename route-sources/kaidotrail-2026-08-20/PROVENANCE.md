# Source route — 旧街道足跡マップ (kaidotrail)

**Retrieved:** 2026-08-20
**Original file:** `tokaido.js.original` — unmodified, do not edit
**SHA-256:** `2c523645cc9183590bb0904a8c2af2accec0635ff662d078fff1ba62ddc6bdc0`
**Upstream commit for this path:** cfb3f11f7e7934a4f00c68df76bb18a3842ecde5 2026-07-23T10:47:31Z
**Source URL:** https://raw.githubusercontent.com/kaidotrail/kaidotrail.github.io/main/public/routes/tokaido.js
**Project:** https://kaidotrail.github.io/ · https://github.com/kaidotrail/kaidotrail.github.io

## Licence

**CC BY-SA 4.0** — Attribution-ShareAlike. Licence text in
`LICENSE-CC-BY-SA-4.0.txt`, taken from the repository root (filed upstream as
`LISENCE`, which is why GitHub's API reports no licence; the text is the real
Creative Commons Attribution-ShareAlike 4.0 International licence).

**No NonCommercial clause.** Chosen over the alternative Gokaidō-Map dataset
(CC BY-NC-SA 4.0) specifically to keep a commercially published map possible if
the book happens.

**Obligations if any derived route is published, including in a public
repository or on GitHub Pages:**

1. Attribute 旧街道足跡マップ / kaidotrail with a link.
2. License the derived route data under CC BY-SA 4.0 as well.
3. Indicate that changes were made.

## What it represents

GPS trajectories from people who actually walked these roads, per the project's
own description. Not a digitisation of historical maps. Coordinates are
latitude/longitude pairs with **no elevation** — which does not matter, because
Footpath substitutes its own terrain model on import.

## Structure

Three JavaScript arrays of `[lat, lon]` pairs with post-station and landmark
names in trailing line comments.

| Array | From | To | Points | Length |
| --- | --- | --- | ---: | ---: |
| `tokaidoEastRoute` | 日本橋 Nihonbashi | 七里の渡 Seven-ri ferry landing, Miya | 3,443 | 374.4 km |
| `sayaRoute` | 東海道・佐屋街道分岐 divergence | 七里の渡跡 Kuwana | 260 | 36.4 km |
| `tokaidoWestRoute` | Kuwana | 髭茶屋追分 Higechaya Oiwake | 1,325 | 116.7 km |

**The Miya–Kuwana discontinuity is honest.** The east route stops at the ferry
landing; the Saya Kaidō is supplied as a separate land alternative branching at a
labelled divergence point. That is the same structure Samwise uses for variants,
which is a good sign about the data.

**Total walking via the Saya Kaidō: ~527.5 km**, plus roughly 6 km still missing
at the Kyoto end. Call it **~533 km**.

## Measured against the project's own numbers

`DAILY-SCHEDULE-DRAFT.md` uses the traditional 495.5 km post-station table. The
real walked line is consistently longer — roughly 3–4 km per stage, about 8%
overall. Cumulative distances on `tokaidoEastRoute`:

| Station | Cumulative | Stage vs draft |
| --- | ---: | --- |
| 9. 小田原宿 Odawara | 85.4 km | |
| 11. 三島宿 Mishima | 116.6 km | 31.2 vs 31.4 draft |
| 16. 由比宿 Yui | 157.2 km | 40.6 vs 38.7 draft |
| 21. 岡部宿 Okabe | 197.9 km | 40.7 vs 37.4 draft |
| 26. 掛川宿 Kakegawa | 234.5 km | 36.6 vs 33.1 draft |
| 29. 浜松宿 Hamamatsu | 269.3 km | 34.8 vs 31.9 draft |
| 34. 吉田宿 Toyohashi | 307.8 km | 38.5 vs 35.3 draft |
| 38. 岡崎宿 Okazaki | 339.5 km | 31.7 vs 27.5 draft |
| 七里の渡 ferry landing | 374.4 km | 34.9 vs 32.6 draft |

## Known gaps and work needed

1. **Final ~6 km into Kyoto is missing.** The west route ends at 髭茶屋追分
   (Higechaya Oiwake) in Yamashina, not at Sanjō Ōhashi. Must be added.
2. **Urban sampling is coarse.** Mean point spacing is 155 m through central
   Tokyo against 66 m across the Hakone block — backwards from what navigation
   needs, since cities have the turns. Densify urban sections.
3. **Two straight jumps over 1 km near Nihonbashi** (indices 4 and 6). Sparse
   sampling, not real gaps, but they cut corners through central Tokyo.
4. **Hakone uses the standard Old Tōkaidō east slope**: 三枚橋 Sanmaibashi →
   大澤坂 Ōsawa-zaka → 畑宿 Hatajuku → 七曲り Nanamagari → 箱根関所 checkpoint.
   The working decision in `FOUNDATION.md` prefers the Hatajuku–Hiryū
   Falls–Ashinoyu hybrid instead. **Branch point is 畑宿本陣, already labelled
   at index 870** — a ready-made anchor for the variant.
5. **Post-station numbering switches to Nakasendō** after the confluence: 石部宿
   is labelled 51 (Tōkaidō) but 草津宿 is 68 and 大津宿 69 (Nakasendō). Watch
   this when building the station ledger.

## Effect on Samwise's own fixtures

The demonstration placemarks in `scripts/build-fixtures.mjs` were written from
general knowledge and are measurably wrong. Distance from this route to each:

| Placemark | Error |
| --- | ---: |
| Nihonbashi | 0.02 km |
| Miya ferry landing | 0.13 km |
| Kuwana ferry landing | 0.09 km |
| Hakone Pass IC | 0.45 km |
| Satta Pass | 1.41 km |
| Hatajuku | 1.62 km |
| Meiji Utsunoya tunnel | 1.88 km |
| **Suzuka Pass** | **3.25 km** |

Replace them from this source rather than correcting them by hand.

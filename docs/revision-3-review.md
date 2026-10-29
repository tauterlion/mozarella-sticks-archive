# Revision 3 — People update review

Draft implementation based on `main` at `74eb6ee5973e8873c98ca35bd02066d43b775929` (Patch 2.1). No merge or deployment is part of this change.

## What changed

- `people.html`, `scripts/people.js`: centered animated character carousel; fading neighbors, two curated traits plus overflow count, alphabetical categories, name/alias suggestions, wraparound, swipe, keyboard, and shareable selection URLs.
- `person.html`, `scripts/person.js`: separate editorial profiles, all reviewed traits and biographies, identity panel, real tagged events, honest image-free event cards, tagged photos/videos, native modal viewer, and links into complete Timeline/Gallery results.
- `scripts/people-shared.js`, `styles/people.css`: centralized portrait loading/silhouette behavior, stable aesthetic palettes, subtle ambient drift, transitions, dark/light themes and reduced-motion support. Palettes imply no personality assessment. Trait icons are decorative geometric marks, not added claims.
- `data/people.json`: 37 people (25 Members / 12 Connected), 28 exact reviewed biographies/trait lists, 10 independent OG flags. All 36 prior IDs/display names and every existing alias retained. Sienna is now Connected. New Valentina uses `valentina`, deliberately normalizing the handoff's proposed `valentina-correa`. Verity is Samantha's alias, never Jaime's.
- Existing public navigation gains People; narrow-header spacing accommodates the fourth link. No framework, build system, historical data rewrites, deployment settings, or Media Manager production-code changes.
- Portrait upload documentation, validation path filters, reviewed-source contract tests and reproducible browser tests.

## Preservation

The 112 timeline events and all 164 media records are unchanged, including captions, file paths, availability and associations. All **126 tracked historical data/media files** are unchanged against the base. See [preservation evidence](revision-3/preservation.json). The only production JSON edit is the specifically authorized people roster enrichment.

The nine Connected People without biographies remain minimal. The mockup's generated photographs, prose, dates, titles, navigation inventions and slogans were not imported.

## How profile selections work

Events require the exact canonical person ID in `event.people`; attendance is never inferred from prose or media. Up to three events are selected deterministically: major first, then chronological date and stable ID. Available images must match that exact event; person-tagged images are preferred. Image failures retain the designed text-only card. A future authentic event image will appear through the existing manifest without changing profile code.

The photo/video strip uses only `available === true` records explicitly tagging the person. It initially presents ten items in archive order; its viewer can navigate all matches. Video thumbnails use existing posters or a play tile. Portrait JPGs never enter the historical media manifest.

## Portrait-only workflow proof

No actual portrait JPGs were included in the handoff or the checked-out archive. The standard render therefore uses silhouettes until the user uploads the originals.

The browser test separately verified **Allysa, Elizabeth Macbeth (`libby`), and Valentina (`valentina`)**:

1. Missing JPG renders a silhouette on both pages.
2. Add only `assets/portraits/<id>.jpg` and reload: both pages display it.
3. Delete only that JPG and reload: both pages return to silhouettes.

No HTML/CSS/JS/JSON was edited during those checks. The test used a visibly labeled abstract **TEST FIXTURE — Not a real portrait**, removed in `finally`; no test JPG is committed. [Directory upload proof](revision-3/directory-photo-fixture.png) and [profile upload proof](revision-3/profile-photo-fixture.png) are screenshots of that fixture, not authentic portraits.

Follow the [exact GitHub upload instructions](../assets/portraits/README.md). Missing images are expected, do not fail validation, and are not negatively cached in persistent application storage. Only seven nearby directory portraits are requested initially.

## Testing

- Archive validator with file checking: **0 errors, 0 warnings**.
- **13 Python tests pass**, including exact reviewed-copy hashes, stable aliases/IDs, status/OG and media-write protection.
- All browser JS passes syntax checking; Git whitespace checks pass.
- [People browser results](revision-3/results.json): all 37 profiles, ordering/category defaults/wrap, exact and partial aliases/accents, search without navigation, keyboard selection/Enter, rapid input, neighboring/center clicks, URL return and browser Back, live transform animations and interpolated ambient colors, photo-only arrival/removal, real profile video playback, modal keyboard/focus, reduced motion and synthetic touch swipe. **24** new-page/theme/viewport combinations at 1672, 1440, 1280, 768, 390 and 320 pixels without horizontal overflow.
- [Existing archive browser results](revision-3/existing-regression-results.json): all 112 Timeline and full-event pages, every filter option, full narrative search, return/previous/next URLs, all 122 available Gallery items, every Gallery filter, viewer controls/focus, all **20 videos decoded and played**, metadata-preserving Media Manager export/add/edit/reset, stale-file and pending-edit protection, diagnostics, **60** existing-page/theme/layout combinations, short viewport and motion-failure fallback.
- The older regression test needed its search expectation updated to include Patch 2.1 `fullDetails`, its stale 114-item constant replaced by the dataset count, and its asynchronous stale-manifest alert properly awaited. These test corrections do not change website behavior.

## Browser screenshots

These show the actual website with the complete production dataset, not the design references.

| Page | Desktop | Mobile |
|---|---|---|
| Directory, dark | [View](revision-3/directory-1672-dark.png) | [View](revision-3/directory-390-dark.png) |
| Directory, light | [View](revision-3/directory-1672-light.png) | [View](revision-3/directory-390-light.png) |
| Editorial profile, dark | [View](revision-3/profile-1672-dark.png) | [View](revision-3/profile-390-dark.png) |
| Editorial profile, light | [View](revision-3/profile-1672-light.png) | [View](revision-3/profile-390-light.png) |

## Preview and review limits

Run `python -m http.server 8765` in the checkout. Open `http://127.0.0.1:8765/people.html?person=lorena` and `http://127.0.0.1:8765/person.html?id=lorena`. These are local previews, not public hosted deployments. Existing Pages deployment configuration is unchanged.

No requested core capability is intentionally left out. The 13 locally exported authentic portraits were not supplied in this package; they still need to be uploaded. Their face crops cannot be visually reviewed until supplied. Browsers tested: installed Chrome through Playwright, including mobile-sized layouts and synthetic touch. Physical mobile devices/keyboards, Safari, Firefox, real screen-reader sessions, audible video playback, and a live Pages photo deployment were not tested. Alternate PNG/WebP portrait autodetection is optional and not implemented; the standard JPG workflow is implemented and proved locally.

Before approval to merge, review **carousel depth/fading, profile spacing, actual portrait crops when available, and the supplied public-facing profile wording**. As requested in the handoff, the source's religion/dating-history labels and portrait publication permissions remain explicit editorial review items. Reviewed wording has not been silently rewritten. Submitting this draft does not authorize publication.

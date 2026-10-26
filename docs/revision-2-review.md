# Revision 2 production integration review

Base: `04fd3031af41c7ddf5839ecc27123be536a0c092` (latest main revalidated before integration).

## Scope

The approved charcoal/cream/gold editorial design now uses the **complete production
archive**. The prototype dataset and application scripts were not copied into production.

- Homepage: original archive photographs, live full-archive counts, featured original records, and chronologically derived latest event.
- Timeline: bottom glass search, genuine rotating archive terms, live event/person suggestions, keyboard/touch modal, and chapter bookmarks.
- All existing filters remain: era/person/category, multi-select importance/certainty including `none`, URL state, anchors, expandable histories, and filtered event navigation.
- Gallery: all original image/video records, six search/filter/sort controls, original order, viewer keyboard controls, original captions and event links. Viewer background is inert and its position is visible.
- Event pages: original historical text, tags, full-frame media, related-event ranking, and previous/next/return context.
- Maintenance: Media Manager, people picker, diagnostics, preparation helper, validator and workflow remain available.
- Shared readable type, compact mobile header, themes, focus styles, progressive entrance motion and reduced-motion behavior.
- Existing `/`, `F`, `T` shortcuts retained, with an opt-out control in public-page footers. Gallery Escape-to-clear remains.
- Superseded browsing/navigation and people-picker patch files are consolidated into their maintained owners. No framework/build system or deployment configuration added.

## Independent safety commit

1. Preparation retains stable IDs, people tags, captions, order, era, envelope and unknown metadata for existing filenames unless specific editorial options are passed. It rejects ambiguous collisions and implicit reassignment; validates references before preparation; stages atomic manifest writes with recoverable backups.
2. Media Manager tracks unfinished forms and unexported session changes, warns before discards/leaving, prevents unfinished-form export, and checks for a changed repository manifest before export.
3. Diagnostics uses the same explicit mismatch predicate for rows and summary.

## Preservation evidence

All **119 tracked files under data/ and assets/** have the same Git blob IDs as the base.
That includes all three production manifests, original media bytes, filenames and captions.
No data or asset diff is present.

| Content | Count |
|---|---:|
| Events | 103 |
| Eras | 10 |
| People | 35 |
| Media records | 156 |
| Available images | 94 |
| Available videos | 20 |
| Hidden placeholders | 42 |

The supplied SHA-256 evidence is in [preservation.json](review/preservation.json).
The source manifests were neither rewritten nor reformatted.

## Verification results

- Archive validator with file checks: **0 errors**, one pre-existing warning about stored event order. Rendering sorts without changing JSON.
- Six Python safety tests pass, including preservation of metadata/envelopes, collision rejection, failed atomic replacement and recovery backups.
- Every browser script passes syntax checking.
- Full browser regression in Chrome 155: every Timeline filter value, every Gallery era/person/event/type value, combined and none-selected filters, aliases, original captions/order, URL restoration, chapter jumps, expansion, and filtered navigation.
- All **103 full-event pages** verified against original titles, summaries, narratives and associated available media.
- All **20 original videos** decoded and played in Chrome.
- Media Manager unedited export equals the complete source object; a single caption edit alters only that field. Dirty-form guards, stale-manifest blocking, people search, add/clear and reset flows passed.
- Diagnostics renders all 156 records with matching row/summary mismatch counts.
- **60 layouts**: six pages × two themes × 320×740, 390×844, 768×1024, 1440×1000 and 844×390. No page-level horizontal overflow; expanded search and all filters reachable.
- Additional short-height viewport, emulated touch, focus cycling, theme persistence, shortcut preference, literal-punctuation search, storage failure, reduced-motion and animation failure checks passed.
- No uncaught JavaScript errors in tested flows.
- Selected production-data screenshots below were visually inspected. Detailed results: [browser-results.json](review/browser-results.json).

## Screenshots

| Page/state | Desktop | Mobile |
|---|---|---|
| Timeline collapsed | [Dark](review/desktop-dark-timeline.png) | [Dark](review/mobile-dark-timeline.png) |
| Timeline expanded | [Light](review/desktop-light-timeline-expanded.png) | [Light](review/mobile-light-timeline-expanded.png) |
| Gallery | [Dark](review/desktop-dark-gallery.png) | [Dark](review/mobile-dark-gallery.png) |
| Home | [Dark](review/desktop-dark-index.png) | — |
| Event | [Dark](review/desktop-dark-event.png) | — |
| Media Manager | — | [Dark](review/mobile-dark-tools-media-manager.png) |

## Remaining limitations and unfinished work

**No existing website capability was intentionally omitted or replaced by a simulated feature.**
The paused People-profile project remains paused; no profiles or new historical content were introduced.

- Physical iOS/Android keyboards, Safari, Firefox, screen-reader use and listening to video audio were not tested. Chrome viewport/touch emulation is not device certification.
- FFmpeg conversion was not rerun; existing video playback was tested. The media helper's new metadata/write behavior was covered by temporary-fixture tests.
- Native select popups retain OS/browser behavior rather than custom animation.
- Media Manager remains an export helper, not an uploader or automatic merge system. Confirm a downloaded file and review it against the latest repository before publishing.
- Existing video poster/caption metadata was not generated or changed. Existing JSON-loading/network requirements and GitHub Pages paths remain.
- No formal performance benchmark or accessibility certification was performed.
- Integration is for review on a feature branch. Nothing has been merged or deployed to main.


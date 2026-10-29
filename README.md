# Mozarella Sticks Archive

A GitHub Pages–ready static archive of the Mozarella Sticks’ shared history, built around a searchable timeline, an event-linked photo and video gallery, and reusable event pages.

Revision 2 applies the approved editorial remaster to the full archive, including the Timeline, Gallery, event pages and maintenance tools. See [integration verification](docs/revision-2-review.md) for scope, tests and screenshots.

## Current archive snapshot

| Item | Current total |
|---|---:|
| Timeline events | 112 |
| Eras | 11 |
| People indexed | 37 |
| Members | 25 |
| Connected people | 12 |
| Media records | 164 |
| Available media records | 122 |
| Hidden placeholders | 42 |

The documented timeline currently runs from **May 12, 2024** through **October 17, 2026**.

No raw WhatsApp exports, phone numbers, or private evidence files are included in the public archive.

## Repository map

- `index.html` — archive landing page and live archive statistics
- `timeline.html` — searchable and filterable timeline
- `gallery.html` — image and video gallery
- `event.html?id=EVENT_ID` — reusable full event page
- `people.html?person=PERSON_ID` — animated, searchable People directory
- `person.html?id=PERSON_ID` — editorial profile, tagged historical appearances and media
- `assets/portraits/` — automatically discovered `<canonical-id>.jpg` portraits
- `data/timeline.json` — eras, categories, and timeline events
- `data/people.json` — canonical person IDs, display names, aliases, and statuses
- `data/media.json` — image and video manifest
- `assets/media/` — current media folder
- `assets/images/` — legacy fallback folder; do not use for new files
- `scripts/` — shared rendering and page behavior
- `styles/` — shared and page-specific styling
- `tools/media-manager.html` — no-code media-manifest helper
- `tools/media-diagnostics.html` — real file-availability diagnostics
- `tools/prepare_media.py` — video conversion and manifest helper
- `tools/validate_archive.py` — archive data validator
- `IMAGE_FILENAMES.md` — filename, placement, and media workflow guide

## Preview locally

The site loads JSON with `fetch()`, so opening `index.html` directly through `file://` may be blocked by browser security.

From the repository root, run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Useful local tools:

```text
http://localhost:8000/tools/media-manager.html
http://localhost:8000/tools/media-diagnostics.html
```

## Publish with GitHub Pages

1. Open **Settings → Pages** in the repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Save and wait for GitHub Pages to deploy the site.

## Sources of truth

The three JSON manifests control nearly all archive content:

```text
data/timeline.json = what happened and who participated
data/people.json   = who exists and how names appear
data/media.json    = which photos and videos belong to each event
```

Person and event IDs are permanent internal references. Display names, captions, and descriptions can change, but IDs should not be renamed casually because other records may depend on them.

## Add or edit an event

Add an object inside the `events` array in `data/timeline.json`.

```json
{
  "id": "kamilo-bowling-birthday",
  "date": "2026-05-01",
  "dateLabel": "May 1, 2026",
  "sort": "2026-05-01T17:00:00",
  "title": "Kamilo’s Bowling Birthday Party",
  "summary": "A short summary for cards and search results.",
  "details": "The full archive description.",
  "era": "9th Grade – Spring 2026",
  "certainty": "confirmed",
  "importance": "supporting",
  "categories": ["Birthday", "Party", "Hangout"],
  "people": ["kamilo", "alejandro"],
  "storylines": []
}
```

Allowed certainty values:

- `confirmed`
- `approximate`
- `range`

Allowed importance values:

- `major`
- `supporting`
- `minor`

Use canonical IDs from `data/people.json` in the `people` array. The timeline page sorts events by the `sort` timestamp before rendering, but keeping the JSON array chronological is still recommended because other pages and tools may use the stored order.

## Add or edit a person

Add or update a record in `data/people.json`:

```json
{
  "id": "kamilo",
  "displayName": "Kamilo",
  "aliases": [],
  "status": "Member"
}
```

Allowed statuses are:

- `Member`
- `Connected Person`

Changing `displayName` or `aliases` is safe. Changing `id` requires updating every timeline and media reference that uses it.

## Longer full-event narratives

The regular `details` field remains the short expandable Timeline explanation. For
selected events that need one or more longer paragraphs on their dedicated Full Event
Page, add an optional `fullDetails` string to the same event object. Separate
paragraphs with two newline characters (`\\n\\n` in JSON). The Full Event Page
preserves those paragraph boundaries and supports simple `*italics*` and
`**bold**` emphasis. If `fullDetails` is absent, the original `details` field
remains the fallback. The Timeline search indexes both versions.

## Add images and videos

Place new files in:

```text
assets/media/
```

A recommended media record is:

```json
{
  "id": "kamilo-birthday-group",
  "file": "kamilo-birthday-group.jpg",
  "caption": "The group at Kamilo’s bowling birthday party.",
  "eventId": "kamilo-bowling-birthday",
  "era": "9th Grade – Spring 2026",
  "people": ["kamilo", "alejandro"],
  "order": 145,
  "path": "assets/media/kamilo-birthday-group.jpg",
  "available": true
}
```

The site can derive a media ID and media type from the filename, but explicit IDs, paths, ordering, and availability flags make the manifest easier to validate and maintain.

Availability behavior:

- `available: true` — the site trusts the manifest and renders the record without a preliminary network check
- `available: false` — the record remains as a hidden placeholder
- missing `available` — legacy fallback behavior may perform a network check

Records marked available must have a matching file at the exact case-sensitive path. The validator checks this automatically in GitHub Actions.

Supported formats:

- Images: JPG, JPEG, PNG, WebP, GIF, SVG, AVIF
- Video: MP4, WebM, OGV

MP4 with H.264 video and AAC audio is the recommended video format.

See `IMAGE_FILENAMES.md` for naming and placement guidance.

## Media Manager

Start the local server and open:

```text
http://localhost:8000/tools/media-manager.html
```

The Media Manager loads the current timeline, people, and media manifests. It can prepare new media records and download a complete replacement `media.json` containing both the original records and additions made during that browser session.

Important limitations:

- It does not upload or move image/video files.
- New files must still be placed in `assets/media/`.
- Unsaved additions are lost when the page is refreshed or closed.
- The downloaded manifest must replace `data/media.json` before the next session.

## Prepare videos

GitHub Pages does not transcode media at runtime. Use the preparation helper for large or incompatible source videos:

```bash
python tools/prepare_media.py input-video.mov --event EVENT_ID --caption "Caption"
```

The helper converts video to a web-compatible MP4, fits it within 720p according to orientation, caps it at 30 FPS, creates a poster frame, places generated files in `assets/media/`, and updates `data/media.json`.

## Validate the archive

Run the dependency-free validator from the repository root:

```bash
python tools/validate_archive.py
```

Also verify that all records marked available have real files:

```bash
python tools/validate_archive.py --check-files
```

Validation checks include:

- duplicate event, person, media, filename, path, and order values
- duplicate people inside a single event or media record
- unknown person and event references
- required fields and allowed enum values
- date, visible date label, sort timestamp, era year, and season consistency
- media extension, type, path, and availability consistency

The workflow in `.github/workflows/validate-archive.yml` runs automatically on relevant pull requests and pushes to `main`.

## Media diagnostics

The normal site trusts `available: true` for performance. To perform real browser requests against every media path, open:

```text
http://localhost:8000/tools/media-diagnostics.html
```

Use the diagnostics page when a gallery item is missing, a filename may have incorrect capitalization, or the manifest and repository files may be out of sync.

## Maintenance history

### 1.3.0 — Timeline additions

Added the Track Pantsing Prank, Caguas Botanical Garden Field Trip, and Welcome-Back Beach Party.

### 1.3.1 — Media performance

Introduced explicit `path` and `available` fields so the site no longer performs more than one hundred file checks before rendering.

### 1.3.2 — Media sync

Merged the 144-record media manifest while preserving fast availability flags and the existing media folder.

### Post-1.3.2 maintenance

- Added Kamilo’s May 1, 2026 bowling birthday event.
- Updated participant lists across much of the timeline.
- Sorted timeline rendering by each event’s `sort` timestamp.
- Added automatic repository validation through GitHub Actions.
- Refreshed documentation to match the current archive structure and workflow.

## Planned expansion

The stable person and event IDs are ready to support future People and Dictionary sections without duplicating timeline content.

## Revision 2 controls and verification

The Timeline search pill opens on click, tap, keyboard focus or `/`. `F` opens its filters.
The existing multi-select importance/certainty controls retain their `none` URL state.
Chapter bookmarks navigate within matching events; **Filter by era** narrows results.
Escape closes the search dialog. Enter shows the full matching chronology.
Gallery retains all six controls, sorting, native video playback and viewer navigation.
`T` returns to the top. Character shortcuts can be disabled in the public-page footer.
Reduced-motion preferences disable entrance effects and rotating search prompts.

No framework or production build step is required. For optional browser regression
checks, install Playwright in a separate test environment, serve the repository,
and run `node tests/browser-regression.cjs`. `PLAYWRIGHT_MODULE`, `CHROME_BIN`,
`BASE_URL`, and `REVIEW_OUTPUT` can override the module path, browser executable,
local URL, and screenshot/result directory. The test defaults to port 8765.
Run `python -m unittest discover -s tests -p "test_*.py"` for media safety tests.

## Revision 3 People update

The People directory and editorial profiles use the existing static site architecture. Membership categories sort by authoritative `fullName`, while `displayName`, original IDs and aliases remain available to existing pages. `data/people.json` adds `fullName`, independent `isOG`, and the 28 reviewed `biography`/`knownFor` entries. Nine Connected People retain minimal profiles without invented copy. Sienna is Connected; Valentina Correa is the new Member with canonical ID `valentina` (normalized from the handoff proposal `valentina-correa`).

Search selects a person without opening the profile; it includes accent-insensitive full names and aliases, prioritizing exact matches. Selection uses `replaceState` and `people.html?person=...`, so returning from a profile restores the selected card without adding an entry for every arrow tap.

**Portrait uploads need no JSON or code changes.** Follow the [JPG upload instructions](assets/portraits/README.md). Missing photos are expected and show silhouettes. Historical media and portrait assets are separate.

Profiles show up to three explicit person-tagged events, selecting major events first, then chronological order with ID as a stable tie-break. Event imagery must belong to the same event; a photo explicitly tagging the person is preferred. Text-only cards are used when no available image exists. The media strip shows the first ten explicitly tagged, available media in archive order; its viewer can browse all matching media. The View All links open the complete existing Timeline/Gallery filters.

See [Revision 3 review and screenshots](docs/revision-3-review.md) for validation and limitations. Run `python -m unittest discover -s tests -p "test_*.py"` and `python tools/validate_archive.py --check-files`. Optional browser suites: `node tests/people-browser.cjs` and `node tests/browser-regression.cjs` with Playwright installed and a local server at `http://127.0.0.1:8765/`. Override `PLAYWRIGHT_MODULE`, `CHROME_BIN`, `BASE_URL` and `REVIEW_OUTPUT` as needed. The website itself has no new runtime dependency or build step.

### Personal background palettes

Set an optional `palette` on a person's existing entry in `data/people.json`, with exactly three six-digit hex colors in **dark, middle, light** order. Keep the three colors in the requested color family. For example, Lucas uses:

```json
"palette": ["#153F32", "#246D4E", "#70B88D"]
```

Edit only this array to change their colors; no JavaScript edits or portrait registration are needed. The shared resolver applies it to the directory's moving ambient fields, portrait/silhouette backgrounds, and existing editorial profile accents. Removing the array restores that person's unchanged deterministic default. Malformed arrays fall back to the default as a whole. Gold controls, text colors, gradient opacity/masks, motion, theme and reduced-motion behavior remain independent of these colors.

The six approved palettes and current screenshots are documented in [personalized palette review](docs/personalized-palettes.md).

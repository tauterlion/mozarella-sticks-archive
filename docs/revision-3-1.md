# AoMS Revision 3.1 — Cinematic Homepage (first iteration)

## Second iteration — 3.1.1

Owner-requested refinements:

- Seamless cross-theme photo-to-page transition (3.1.2): fade to the actual page background and mask film grain before the last pixel of the hero, eliminating the visible horizontal color seam.

- Stronger, theme-aware fade across the bottom of the hero, with the unchanged original group photograph raised slightly.
- Rounded, blurred glass Explore button.
- A unified AoMS film-style header on all six main public pages (index, Timeline, Gallery, People, profile and event).
- Slow 950–1080ms upward entrance fades for headings, thumbnails and event text, excluding the cinematic background photograph.
- Small capped scroll-direction lag exclusively on the hero headline, stronger when scrolling upward. Other headings retain entrance fades only; reduced-motion preference disables both.

## Final layout polish — 3.1.3

- Make hero kicker, headline and subtitle somewhat smaller and closer to the top of the viewport.
- Lift the unchanged photograph slightly higher, with responsive framing that leaves faces unobstructed by lettering.
- Remove the repeated “THE”: “THE ARCHIVE OF” / “THE” / “MOZARELLA STICKS”.
- Restrict inertial scrolling to the hero headline alone. All other headlines, thumbnails and event text retain only entrance fades.
- Remove the redundant archive-range micro-section immediately after the statistics while preserving the counters.

## Scope

Revise **only the homepage** to open like a film title sequence. The desktop first view uses a full-viewport photograph, prominent *MOZARELLA STICKS* title, film-style navigation, a tagline, and an **Explore the Archive** scroll entry. Continue the existing archive home sections unchanged below the fold.

## Source photo

Use the existing authentic `assets/media/beach-party-everyone.jpg` asset. Avoid generated or substituted faces. The separate downloadable interactive preview uses the user-supplied original beach bonfire edit. Confirm the exact image matches the intended final edit before release.

## Safe file boundaries

- `index.html`: home-only markup, header treatment and persistent section anchors.
- `styles/home.css`: cinematic hero, bottom fade, oval glass CTA and responsive presentation, retaining existing feature/gallery/section styles.
- `styles/shared.css`: shared film navigation and text-motion style.
- `scripts/interactions.js`: progressive enhancement for accessible entrance reveals and capped scroll drift.
- `timeline.html`, `gallery.html`, `people.html`, `person.html`, `event.html`: unify top navigation without modifying data or page-specific functional markup.
- `scripts/home.js`: remove only the old dynamic hero selection; preserve all home data loads.
- `tests/home-cinematic.cjs`: static integration guards.

**Do not edit:** `data/*.json`, Supabase, files belonging to the Community Submissions feature branch, or PR #18. Developer-only `tools/` pages retain their existing utility layout.

## Interaction

- Branding links to the homepage; Timeline, Gallery and People retain their regular routes.
- The CTA and scroll arrow use native `#inside-archive` links; no JavaScript required.
- The shared theme toggle remains functional; both themes use an intentionally dark cinematic opening.
- The shared skip link, headings, text alternative, keyboard focus and reduced-motion rules remain available.
- The archive's existing cards, stats and latest entry still render from the source data.

## Preview and acceptance checks

1. Compare 16:9 desktop (1440×810 / 1600×900 / 1920×1080) against the approved visual direction.
2. Check mobile widths (390 and 320 px), tablet, and short landscape viewports.
3. Confirm every person remains visible as practical at desktop width; no AI changes to faces.
4. Click CTA, scroll arrow, navigation and theme control; check keyboard focus.
5. Run `node tests/home-cinematic.cjs`, `python tools/validate_archive.py --check-files` and the existing browser regression suite.
6. Verify no console errors, blocked images, horizontal overflow, changed events, altered people, or missing Gallery media.
7. Verify the animation runs when new Gallery/Timeline items are rendered after data loading, that captions remain readable while scrolling up/down, and that `prefers-reduced-motion` suppresses it.
8. Merge only after owner approval and preview review. Do not merge PR #18 together with this redesign.

## Future iterations (not yet included)

Potential improvements to consider after review: more exact image positioning, photo-specific dark/light color grading, scroll reveal between opening and stats, mobile framing controls. Avoid automatic autoplay or slow unskippable intros.

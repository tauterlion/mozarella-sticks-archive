# AoMS Revision 3.1 — Cinematic Homepage (first iteration)

## Scope

Revise **only the homepage** to open like a film title sequence. The desktop first view uses a full-viewport photograph, prominent *MOZARELLA STICKS* title, film-style navigation, a tagline, and an **Explore the Archive** scroll entry. Continue the existing archive home sections unchanged below the fold.

## Source photo

Use the existing authentic `assets/media/beach-party-everyone.jpg` asset. Avoid generated or substituted faces. The separate downloadable interactive preview uses the user-supplied original beach bonfire edit. Confirm the exact image matches the intended final edit before release.

## Safe file boundaries

- `index.html`: home-only markup, header treatment and persistent section anchors.
- `styles/home.css`: cinematic hero and responsive presentation, retaining existing feature/gallery/section styles.
- `scripts/home.js`: remove only the old dynamic hero selection; preserve all home data loads.
- `tests/home-cinematic.cjs`: static integration guards.

**Do not edit:** `data/*.json`, other page templates/styles/scripts, Supabase, or PR #18.

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
7. Merge only after owner approval and preview review. Do not merge PR #18 together with this redesign.

## Future iterations (not yet included)

Potential improvements to consider after review: more exact image positioning, photo-specific dark/light color grading, scroll reveal between opening and stats, mobile framing controls. Avoid automatic autoplay or slow unskippable intros.

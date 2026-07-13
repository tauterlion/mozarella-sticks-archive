# Mozarella Sticks Archive — Version B.1.2

A GitHub Pages–ready static archive with a timeline, gallery, and reusable event pages.

## Included

- `index.html` — archive landing page
- `timeline.html` — searchable and filterable timeline
- `gallery.html` — event-linked image and video gallery that only shows files that exist
- `event.html?id=EVENT_ID` — reusable full event page
- `data/timeline.json` — 98 cleaned timeline events
- `data/people.json` — canonical names, aliases, and Member/Connected Person tags
- `data/media.json` — approved image/video records; IDs and media types may be omitted and will be generated from filenames

No raw WhatsApp exports, phone numbers, screenshots, or private evidence are included.

## Preview locally

Because the site loads JSON files, opening `index.html` directly with `file://` may be blocked by browser security.

From the project folder, run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Upload the entire project, preserving the folders.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save and wait for the public URL.

## Add an event

Add a new object to `data/timeline.json` inside `events`. Preserve the existing field names and use a unique, permanent `id`.

Date certainty values:

- `confirmed`
- `approximate`
- `range`

Importance values:

- `major`
- `supporting`
- `minor`

## Add images and videos

Use `assets/media/` for new photos and videos. The old `assets/images/` folder remains supported for compatibility.

A minimal record in `data/media.json` only needs:

```json
{
  "file": "event-clip-01.mp4",
  "caption": "A short caption.",
  "eventId": "event-id"
}
```

The site automatically derives the media ID and whether the file is an image or video.

Missing files remain invisible. Existing media automatically appears in the matching expanded timeline card, event page, and gallery.

Recommended filename format:

```text
event-name-01.jpg
event-name-02.jpg
```

Use lowercase letters, hyphens, two-digit numbering, and no punctuation or emoji.

## Future expansion

The data structure is ready for later People and Dictionary sections. Those pages can reference the same stable event and person IDs without duplicating timeline content.


## Interface revision 1.1

- Restored the vertical timeline line and event dots from Version A.
- Event cards keep people and category tags behind **View more**.
- Added animated event expansion.
- Rebuilt timeline search as a sticky oval search bar with rotating prompts.
- Consolidated Era, Person, Category, Importance, and Date controls inside one Filters drawer.
- Added hover highlights and glow states across navigation, links, buttons, tags, and event controls.
- Increased event date and title sizes.


## MP4 and media tools

Supported gallery media:

- Images: JPG, JPEG, PNG, WebP, GIF, SVG, AVIF
- Video: MP4, WebM, OGV

MP4 with H.264 video and AAC audio is the recommended video format.

GitHub Pages cannot downscale videos at runtime. Use:

```bash
python tools/prepare_media.py input-video.mov --event EVENT_ID --caption "Caption"
```

The script converts video to web-compatible MP4, fits it within 720p according to orientation, caps it at 30 FPS, creates a poster frame, places it in `assets/media/`, and updates `data/media.json`.

For a no-code manifest helper, preview the site locally and open:

```text
http://localhost:8000/tools/media-manager.html
```

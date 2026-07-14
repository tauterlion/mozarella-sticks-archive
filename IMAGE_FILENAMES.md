# Media Filename and Placement Guide

`data/media.json` is the source of truth for gallery media. This guide explains how filenames, paths, availability flags, videos, and poster images should be handled.

The old checklist in this file was not a complete inventory of the current 144-record media manifest. Do not use this document to decide whether a media record exists; check `data/media.json` instead.

## Where new files belong

Place all new images, videos, and generated poster frames in:

```text
assets/media/
```

The older `assets/images/` folder remains supported as a legacy fallback, but new files should not be added there.

The incorrect plural path `assets/medias/` is not used.

## Recommended naming pattern

Use lowercase letters, numbers, and hyphens:

```text
event-name-01.jpg
event-name-02.jpg
event-name-01.mp4
event-name-01-poster.jpg
```

Good examples:

```text
kamilo-birthday-group-01.jpg
caguas-botanical-garden-01.jpeg
welcome-back-beach-party-01.jpg
spirit-week-dance-01.mp4
spirit-week-dance-01-poster.jpg
```

Recommended rules:

- Keep the filename descriptive and tied to the event.
- Use two-digit numbering when an event has multiple files.
- Avoid spaces, emoji, ampersands, and punctuation in new filenames.
- Keep the extension lowercase.
- Treat capitalization as significant because GitHub Pages paths are case-sensitive.

Legacy files with spaces, capitals, or punctuation can remain in place. Their manifest `file` and `path` values must match the actual filename exactly.

## Supported formats

Images:

```text
.jpg .jpeg .png .webp .gif .svg .avif
```

Videos:

```text
.mp4 .webm .ogv
```

MP4 with H.264 video and AAC audio is the preferred video format for broad browser support.

## Manifest path and availability

Each record should point to the exact repository path:

```json
{
  "file": "kamilo-birthday-group-01.jpg",
  "path": "assets/media/kamilo-birthday-group-01.jpg",
  "available": true
}
```

Availability behavior:

- `available: true` means the site renders the record immediately and trusts that the file exists.
- `available: false` keeps the record as a hidden placeholder.
- Omitting `available` uses legacy file-detection behavior and may cause an additional network request.

A record marked available should always have a real file at its exact path. GitHub Actions verifies this with:

```bash
python tools/validate_archive.py --check-files
```

## Media IDs

Media IDs should be unique and stable. For new files, use the filename stem when possible:

```text
file: kamilo-birthday-group-01.jpg
id:   kamilo-birthday-group-01
```

The site and tools can derive an ID from the filename, but keeping an explicit ID in `data/media.json` makes references and validation clearer.

## Event and people links

Every record should use a valid event ID from `data/timeline.json`:

```json
"eventId": "kamilo-bowling-birthday"
```

Use canonical person IDs from `data/people.json`:

```json
"people": ["kamilo", "alejandro", "maria"]
```

These fields control event grouping and person filtering in the Gallery.

## Video poster frames

A video may include a generated poster image so the page can display a preview before playback.

Recommended pair:

```text
spirit-week-dance-01.mp4
spirit-week-dance-01-poster.jpg
```

Use `tools/prepare_media.py` to convert videos and create poster frames automatically:

```bash
python tools/prepare_media.py input-video.mov --event EVENT_ID --caption "Caption"
```

## Recommended workflow

1. Choose or confirm the event ID in `data/timeline.json`.
2. Rename the media file using the recommended convention.
3. Place it in `assets/media/`.
4. Add the record with the Media Manager or edit `data/media.json` directly.
5. Add the people visible in the media using canonical IDs.
6. Run the archive validator.
7. Preview the Gallery and matching event page locally.
8. Use the diagnostics page when a file does not appear.

Local tools:

```text
http://localhost:8000/tools/media-manager.html
http://localhost:8000/tools/media-diagnostics.html
```

## Troubleshooting missing media

Check these items first:

- The file is inside `assets/media/`.
- `file` and `path` match the real filename exactly.
- The extension is supported.
- `available` is `true` for files that should be visible.
- `eventId` matches a real timeline event.
- The media record has a unique `id` and `order` value.
- GitHub Pages has finished deploying the latest commit.

The diagnostics page performs real requests and reports manifest/file mismatches without changing the repository.

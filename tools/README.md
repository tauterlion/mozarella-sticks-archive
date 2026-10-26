# Media tools

## Easiest no-code method

Run the website locally, then open:

```text
http://localhost:8000/tools/media-manager.html
```

The Media Manager lets you:

- Select images or MP4/WebM videos
- Choose the related event
- Generate IDs automatically from filenames
- Download a complete updated `media.json`

It does **not** upload the actual files. Put those files in:

```text
assets/media/
```

## Prepare and compress videos

The site can play MP4 directly, but GitHub Pages cannot resize or re-encode videos.

Run:

```bash
python tools/prepare_media.py "path/to/video.mov" --event EVENT_ID --caption "Caption here"
```

The script:

- Converts the video to MP4 using H.264/AAC
- Fits landscape video inside 1280×720
- Fits portrait video inside 720×1280
- Caps frame rate at 30 FPS
- Creates a poster image
- Copies the result into `assets/media/`
- Updates `data/media.json`

FFmpeg and FFprobe must be installed.

Process an image:

```bash
python tools/prepare_media.py "path/to/photo.jpg" --event EVENT_ID --caption "Caption here"
```

Add people when useful:

```bash
python tools/prepare_media.py clip.mp4 --event spirit-week-dance --people lucas samantha alejandro
```

## Editing and export safeguards

The manager distinguishes unfinished form edits from changes saved to the current
browser session. Switching records asks before discarding unfinished edits. Downloads
require pending forms to be saved, added, or cleared first. Leaving warns when edits
have not been exported. Revert/reset/clear actions confirm before discarding work.
An export preserves the original manifest envelope and all untouched record fields.
Before export, the manager re-fetches media.json and blocks an outdated session from
silently replacing a newer manifest. A download does not publish anything: verify the
file and review its diff against the latest repository before replacing the manifest.
This browser helper still does not upload assets or provide multi-user merge support.

The preparation helper validates event/person references before preparing files.
For an existing exact filename it retains the stable ID, order, caption, people,
era and unknown metadata. Only explicit `--caption` / `--people` options edit those
fields. Omitting `--people` preserves existing tags; supplying it with no values
explicitly clears them. Ambiguous filename/ID collisions and event reassignment are
rejected. A new filename creates a new record. Existing physical files are never
overwritten by preparation; the normal unique-name suffix is retained.

Manifest updates are staged and atomically replaced, with a unique
`data/media-backup-*.json` backup of the previous bytes. These local backups are
ignored by Git. FFmpeg/FFprobe are still required for video conversion. Conversion
was not rerun during the remaster; browser playback of the 20 originals was tested.

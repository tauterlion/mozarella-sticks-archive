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

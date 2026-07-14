#!/usr/bin/env python3
"""
Prepare images and videos for the Mozarella Sticks Archive.

Examples:
  python tools/prepare_media.py clip.mov --event spirit-week-dance --caption "The dance performance."
  python tools/prepare_media.py photo.jpg --event prom-2025 --people alejandro lorena

What it does:
- Copies supported web images into assets/media/
- Converts videos to browser-friendly MP4 (H.264/AAC)
- Fits landscape video inside 1280x720 and portrait video inside 720x1280
- Caps frame rate at 30 FPS
- Generates a JPG poster frame
- Adds or updates a record in data/media.json when --event is supplied
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA_DIR = ROOT / "assets" / "media"
MEDIA_JSON = ROOT / "data" / "media.json"
TIMELINE_JSON = ROOT / "data" / "timeline.json"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"}


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "media"


def humanize(stem: str) -> str:
    return re.sub(r"[-_]+", " ", stem).strip().title()


def ensure_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"{name} is required but was not found on PATH.")


def run(command: list[str]) -> None:
    print("+", " ".join(str(part) for part in command))
    subprocess.run(command, check=True)


def ffprobe(path: Path) -> dict:
    ensure_command("ffprobe")
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,codec_name",
            "-of", "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    streams = payload.get("streams", [])
    if not streams:
        raise RuntimeError(f"No video stream found in {path}")
    return streams[0]


def parse_fps(value: str | None) -> float:
    if not value or value in {"0/0", "N/A"}:
        return 0.0
    try:
        return float(Fraction(value))
    except (ValueError, ZeroDivisionError):
        return 0.0


def target_dimensions(width: int, height: int) -> tuple[int, int]:
    if width <= 0 or height <= 0:
        raise ValueError("Invalid video dimensions.")

    max_width, max_height = ((1280, 720) if width >= height else (720, 1280))
    scale = min(1.0, max_width / width, max_height / height)
    target_w = max(2, int(math.floor(width * scale / 2) * 2))
    target_h = max(2, int(math.floor(height * scale / 2) * 2))
    return target_w, target_h


def unique_output(stem: str, extension: str) -> Path:
    candidate = MEDIA_DIR / f"{stem}{extension}"
    if not candidate.exists():
        return candidate
    number = 2
    while True:
        candidate = MEDIA_DIR / f"{stem}-{number:02d}{extension}"
        if not candidate.exists():
            return candidate
        number += 1


def prepare_image(source: Path) -> tuple[Path, str | None]:
    extension = source.suffix.lower()
    if extension not in IMAGE_EXTENSIONS:
        raise RuntimeError(
            f"Unsupported image format: {extension}. Convert HEIC/TIFF files to JPG, PNG, or WebP first."
        )
    destination = unique_output(slugify(source.stem), extension)
    shutil.copy2(source, destination)
    return destination, None


def prepare_video(source: Path) -> tuple[Path, str]:
    ensure_command("ffmpeg")
    info = ffprobe(source)
    width = int(info.get("width", 0))
    height = int(info.get("height", 0))
    fps = parse_fps(info.get("avg_frame_rate") or info.get("r_frame_rate"))
    target_w, target_h = target_dimensions(width, height)

    destination = unique_output(slugify(source.stem), ".mp4")
    filters: list[str] = []
    if (target_w, target_h) != (width, height):
        filters.append(f"scale={target_w}:{target_h}")
    if fps > 30.0001:
        filters.append("fps=30")

    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a?",
    ]
    if filters:
        command += ["-vf", ",".join(filters)]
    command += [
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        str(destination),
    ]
    run(command)

    poster = destination.with_name(f"{destination.stem}-poster.jpg")
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", "00:00:00.500",
        "-i", str(destination),
        "-frames:v", "1",
        "-update", "1",
        "-q:v", "2",
        str(poster),
    ])
    return destination, poster.name


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def update_manifest(
    file_name: str,
    media_type: str,
    poster: str | None,
    event_id: str,
    caption: str | None,
    people: list[str],
) -> None:
    timeline = load_json(TIMELINE_JSON)
    events = {event["id"]: event for event in timeline["events"]}
    if event_id not in events:
        raise RuntimeError(f"Unknown event ID: {event_id}")

    data = load_json(MEDIA_JSON)
    records = data.get("media", data if isinstance(data, list) else [])
    media_id = slugify(Path(file_name).stem)

    record = {
        "id": media_id,
        "file": file_name,
        "path": f"assets/media/{file_name}",
        "available": True,
        "type": media_type,
        "caption": caption or humanize(Path(file_name).stem),
        "eventId": event_id,
        "people": people,
        "order": max([int(item.get("order", 0)) for item in records] + [0]) + 1,
    }
    if poster:
        record["poster"] = poster
        record["posterPath"] = f"assets/media/{poster}"
        record["posterAvailable"] = True

    replaced = False
    for index, item in enumerate(records):
        if item.get("file") == file_name or item.get("id") == media_id:
            record["order"] = item.get("order", record["order"])
            records[index] = record
            replaced = True
            break
    if not replaced:
        records.append(record)

    MEDIA_JSON.write_text(json.dumps({"media": records}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{'Updated' if replaced else 'Added'} media record: {media_id}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare archive images/videos and optionally update media.json.")
    parser.add_argument("files", nargs="+", type=Path, help="Input image or video files")
    parser.add_argument("--event", help="Timeline event ID to link the media to")
    parser.add_argument("--caption", help="Caption. Best used when processing one file.")
    parser.add_argument("--people", nargs="*", default=[], help="Canonical person IDs")
    parser.add_argument("--no-manifest", action="store_true", help="Do not update data/media.json")
    args = parser.parse_args()

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)

    for source in args.files:
        source = source.expanduser().resolve()
        if not source.exists() or not source.is_file():
            raise RuntimeError(f"Input file not found: {source}")

        if source.suffix.lower() in IMAGE_EXTENSIONS:
            destination, poster = prepare_image(source)
            media_type = "image"
        else:
            destination, poster = prepare_video(source)
            media_type = "video"

        print(f"Prepared: {destination.relative_to(ROOT)}")
        if poster:
            print(f"Poster:   {(MEDIA_DIR / poster).relative_to(ROOT)}")

        if not args.no_manifest:
            if not args.event:
                print("Manifest not updated because --event was not supplied.")
            else:
                caption = args.caption if len(args.files) == 1 else None
                update_manifest(destination.name, media_type, poster, args.event, caption, args.people)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)

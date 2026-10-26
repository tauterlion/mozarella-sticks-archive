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
import os
import tempfile
import copy
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


def validate_references(event_id: str, people: list[str] | None) -> None:
    events = load_json(TIMELINE_JSON)["events"]
    if event_id not in {event["id"] for event in events}:
        raise RuntimeError(f"Unknown event ID: {event_id}")
    known = {person["id"] for person in load_json(ROOT / "data" / "people.json")["people"]}
    unknown = set(people or []) - known
    if unknown:
        raise RuntimeError(f"Unknown people IDs: {', '.join(sorted(unknown))}")


def merged_manifest(data, file_name, media_type, poster, event_id, caption, people):
    """Retain the envelope and all existing editorial fields unless explicitly edited."""
    result = copy.deepcopy(data)
    records = result if isinstance(result, list) else result["media"]
    media_id = slugify(Path(file_name).stem)
    matches = [item for item in records if item.get("file") == file_name]
    if len(matches) > 1:
        raise RuntimeError("Ambiguous filename: multiple existing records.")
    existing = matches[0] if matches else None
    if existing is None and any(item.get("id") == media_id for item in records):
        raise RuntimeError("Generated ID belongs to a different file; choose a unique filename.")
    if existing and existing.get("eventId") != event_id:
        raise RuntimeError("Existing media belongs to a different event. Edit its association explicitly in Media Manager.")
    if existing:
        record = existing
        record.update(path=f"assets/media/{file_name}", available=True, type=media_type)
        if caption is not None:
            record["caption"] = caption
        if people is not None:
            record["people"] = list(people)
    else:
        record = {
            "id": media_id, "file": file_name, "path": f"assets/media/{file_name}",
            "available": True, "type": media_type,
            "caption": caption if caption is not None else humanize(Path(file_name).stem),
            "eventId": event_id, "people": list(people or []),
            "order": max([int(item.get("order", 0)) for item in records] + [0]) + 1,
        }
        records.append(record)
    if poster:
        record.update(poster=poster, posterPath=f"assets/media/{poster}", posterAvailable=True)
    return result


def update_manifest(file_name, media_type, poster, event_id, caption, people):
    validate_references(event_id, people)
    original = MEDIA_JSON.read_bytes()
    data = json.loads(original)
    result = merged_manifest(data, file_name, media_type, poster, event_id, caption, people)
    # Stage and validate before touching the original; keep a unique recoverable backup.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=MEDIA_JSON.parent,
                                     prefix=".media-", suffix=".json", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(result, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    try:
        json.loads(temporary.read_text(encoding="utf-8"))
        if MEDIA_JSON.read_bytes() != original:
            raise RuntimeError("media.json changed while preparing; refusing to overwrite newer edits.")
        with tempfile.NamedTemporaryFile(dir=MEDIA_JSON.parent, prefix="media-backup-",
                                         suffix=".json", delete=False) as backup:
            backup.write(original)
            backup_path = Path(backup.name)
        os.replace(temporary, MEDIA_JSON)
        print(f"Saved media.json; previous version: {backup_path}")
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare archive images/videos and optionally update media.json.")
    parser.add_argument("files", nargs="+", type=Path, help="Input image or video files")
    parser.add_argument("--event", help="Timeline event ID to link the media to")
    parser.add_argument("--caption", help="Caption. Best used when processing one file.")
    parser.add_argument("--people", nargs="*", default=None, help="Canonical person IDs")
    parser.add_argument("--no-manifest", action="store_true", help="Do not update data/media.json")
    args = parser.parse_args()

    if args.event and not args.no_manifest:
        validate_references(args.event, args.people)
    for source in args.files:
        if not source.expanduser().is_file():
            raise RuntimeError(f"Input file not found: {source}")
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

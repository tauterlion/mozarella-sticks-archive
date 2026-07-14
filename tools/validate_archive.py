#!/usr/bin/env python3
"""Validate the Mozarella Sticks Archive JSON manifests.

Run from anywhere with:

    python tools/validate_archive.py

Use ``--check-files`` to verify that every media record marked available points
to a real file in the repository.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogv"}
SUPPORTED_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | SUPPORTED_VIDEO_EXTENSIONS
ALLOWED_IMPORTANCE = {"major", "supporting", "minor"}
ALLOWED_CERTAINTY = {"confirmed", "approximate", "range"}
ALLOWED_STATUSES = {"Member", "Connected Person"}
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")


@dataclass(frozen=True)
class Finding:
    severity: str
    file: str
    location: str
    message: str


class Validator:
    def __init__(self, root: Path, check_files: bool) -> None:
        self.root = root
        self.check_files = check_files
        self.findings: list[Finding] = []

    def error(self, file: str, location: str, message: str) -> None:
        self.findings.append(Finding("error", file, location, message))

    def warning(self, file: str, location: str, message: str) -> None:
        self.findings.append(Finding("warning", file, location, message))

    def load_json(self, relative_path: str) -> dict[str, Any] | None:
        path = self.root / relative_path
        try:
            with path.open("r", encoding="utf-8") as handle:
                value = json.load(handle)
        except FileNotFoundError:
            self.error(relative_path, "$", "File does not exist.")
            return None
        except json.JSONDecodeError as exc:
            self.error(relative_path, f"line {exc.lineno}, column {exc.colno}", exc.msg)
            return None
        except OSError as exc:
            self.error(relative_path, "$", f"Could not read file: {exc}")
            return None

        if not isinstance(value, dict):
            self.error(relative_path, "$", "Top-level JSON value must be an object.")
            return None
        return value

    def validate(self) -> None:
        timeline = self.load_json("data/timeline.json")
        people = self.load_json("data/people.json")
        media = self.load_json("data/media.json")
        if timeline is None or people is None or media is None:
            return

        people_records = self.expect_list(people, "people", "data/people.json")
        event_records = self.expect_list(timeline, "events", "data/timeline.json")
        era_order = self.expect_string_list(timeline, "eraOrder", "data/timeline.json")
        category_order = self.expect_string_list(timeline, "categoryOrder", "data/timeline.json")
        media_records = self.expect_list(media, "media", "data/media.json")

        people_ids = self.validate_people(people_records)
        event_map = self.validate_timeline(event_records, era_order, category_order, people_ids)
        self.validate_media(media_records, event_map, people_ids)

    def expect_list(self, obj: dict[str, Any], key: str, file: str) -> list[Any]:
        value = obj.get(key)
        if not isinstance(value, list):
            self.error(file, f"$.{key}", "Expected an array.")
            return []
        return value

    def expect_string_list(self, obj: dict[str, Any], key: str, file: str) -> list[str]:
        values = self.expect_list(obj, key, file)
        result: list[str] = []
        for index, value in enumerate(values):
            if not isinstance(value, str) or not value.strip():
                self.error(file, f"$.{key}[{index}]", "Expected a non-empty string.")
            else:
                result.append(value)
        self.check_duplicates(result, file, f"$.{key}", "value")
        return result

    def validate_people(self, records: list[Any]) -> set[str]:
        file = "data/people.json"
        ids: list[str] = []
        display_names: list[str] = []

        for index, raw in enumerate(records):
            location = f"$.people[{index}]"
            if not isinstance(raw, dict):
                self.error(file, location, "Person record must be an object.")
                continue

            person_id = self.required_string(raw, "id", file, location)
            display_name = self.required_string(raw, "displayName", file, location)
            status = self.required_string(raw, "status", file, location)
            aliases = raw.get("aliases")

            if person_id:
                ids.append(person_id)
                self.validate_id(person_id, file, f"{location}.id")
            if display_name:
                display_names.append(display_name.casefold())
            if status and status not in ALLOWED_STATUSES:
                self.error(file, f"{location}.status", f"Unknown status {status!r}.")

            if not isinstance(aliases, list):
                self.error(file, f"{location}.aliases", "Expected an array.")
            else:
                clean_aliases: list[str] = []
                for alias_index, alias in enumerate(aliases):
                    alias_location = f"{location}.aliases[{alias_index}]"
                    if not isinstance(alias, str) or not alias.strip():
                        self.error(file, alias_location, "Alias must be a non-empty string.")
                    else:
                        clean_aliases.append(alias.casefold())
                self.check_duplicates(clean_aliases, file, f"{location}.aliases", "alias")

        self.check_duplicates(ids, file, "$.people", "person ID")
        self.check_duplicates(display_names, file, "$.people", "display name", severity="warning")
        return set(ids)

    def validate_timeline(
        self,
        records: list[Any],
        era_order: list[str],
        category_order: list[str],
        people_ids: set[str],
    ) -> dict[str, dict[str, Any]]:
        file = "data/timeline.json"
        era_set = set(era_order)
        category_set = set(category_order)
        event_ids: list[str] = []
        valid_events: dict[str, dict[str, Any]] = {}
        sort_values: list[tuple[str, str]] = []

        for index, raw in enumerate(records):
            location = f"$.events[{index}]"
            if not isinstance(raw, dict):
                self.error(file, location, "Event record must be an object.")
                continue

            event_id = self.required_string(raw, "id", file, location)
            event_date = self.required_string(raw, "date", file, location)
            date_label = self.required_string(raw, "dateLabel", file, location)
            sort_value = self.required_string(raw, "sort", file, location)
            self.required_string(raw, "title", file, location)
            self.required_string(raw, "summary", file, location)
            self.required_string(raw, "details", file, location)
            era = self.required_string(raw, "era", file, location)
            certainty = self.required_string(raw, "certainty", file, location)
            importance = self.required_string(raw, "importance", file, location)

            if event_id:
                event_ids.append(event_id)
                self.validate_id(event_id, file, f"{location}.id")
                valid_events[event_id] = raw
            if era and era not in era_set:
                self.error(file, f"{location}.era", f"Era {era!r} is not listed in eraOrder.")
            if certainty and certainty not in ALLOWED_CERTAINTY:
                self.error(file, f"{location}.certainty", f"Unknown certainty {certainty!r}.")
            if importance and importance not in ALLOWED_IMPORTANCE:
                self.error(file, f"{location}.importance", f"Unknown importance {importance!r}.")

            categories = self.string_array(raw, "categories", file, location)
            for category_index, category in enumerate(categories):
                if category not in category_set:
                    self.error(
                        file,
                        f"{location}.categories[{category_index}]",
                        f"Category {category!r} is not listed in categoryOrder.",
                    )

            event_people = self.string_array(raw, "people", file, location)
            self.validate_people_references(event_people, people_ids, file, f"{location}.people")
            self.string_array(raw, "storylines", file, location)

            parsed_date = self.parse_date(event_date, file, f"{location}.date") if event_date else None
            parsed_sort = self.parse_datetime(sort_value, file, f"{location}.sort") if sort_value else None
            if parsed_sort and parsed_date and parsed_sort.date() != parsed_date:
                self.error(
                    file,
                    f"{location}.sort",
                    f"Sort date {parsed_sort.date().isoformat()} does not match date {parsed_date.isoformat()}.",
                )
            if sort_value and event_id:
                sort_values.append((sort_value, event_id))

            if parsed_date and date_label:
                label_years = {int(value) for value in YEAR_PATTERN.findall(date_label)}
                if label_years and parsed_date.year not in label_years:
                    self.error(
                        file,
                        f"{location}.dateLabel",
                        f"Visible label years {sorted(label_years)} do not include date year {parsed_date.year}.",
                    )

            if parsed_date and era:
                self.validate_era_date(parsed_date, era, file, f"{location}.era")

        self.check_duplicates(event_ids, file, "$.events", "event ID")

        if sort_values != sorted(sort_values):
            self.warning(
                file,
                "$.events",
                "Events are not stored chronologically. The site sorts them at render time, but keeping the JSON ordered makes reviews easier.",
            )
        return valid_events

    def validate_media(
        self,
        records: list[Any],
        event_map: dict[str, dict[str, Any]],
        people_ids: set[str],
    ) -> None:
        file = "data/media.json"
        ids: list[str] = []
        orders: list[int] = []
        files: list[str] = []
        paths: list[str] = []

        for index, raw in enumerate(records):
            location = f"$.media[{index}]"
            if not isinstance(raw, dict):
                self.error(file, location, "Media record must be an object.")
                continue

            media_id = self.required_string(raw, "id", file, location)
            filename = self.required_string(raw, "file", file, location)
            self.required_string(raw, "caption", file, location)
            event_id = self.required_string(raw, "eventId", file, location)
            path_value = self.required_string(raw, "path", file, location)
            available = raw.get("available")
            order = raw.get("order")

            if media_id:
                ids.append(media_id)
                self.validate_id(media_id, file, f"{location}.id")
            if filename:
                files.append(filename.casefold())
                extension = Path(filename).suffix.casefold()
                if extension not in SUPPORTED_EXTENSIONS:
                    self.error(file, f"{location}.file", f"Unsupported file extension {extension or '(none)'!r}.")
            if event_id and event_id not in event_map:
                self.error(file, f"{location}.eventId", f"Unknown event ID {event_id!r}.")

            media_people = self.string_array(raw, "people", file, location)
            self.validate_people_references(media_people, people_ids, file, f"{location}.people")

            if not isinstance(order, int) or isinstance(order, bool) or order < 1:
                self.error(file, f"{location}.order", "Order must be a positive integer.")
            else:
                orders.append(order)

            if not isinstance(available, bool):
                self.error(
                    file,
                    f"{location}.available",
                    "Availability must be true or false. This field prevents slow network probing on the live site.",
                )

            if path_value:
                paths.append(path_value.casefold())
                self.validate_media_path(path_value, filename, available, file, location)

            declared_type = raw.get("type")
            if declared_type is not None:
                if declared_type not in {"image", "video"}:
                    self.error(file, f"{location}.type", "Type must be 'image' or 'video'.")
                elif filename:
                    extension = Path(filename).suffix.casefold()
                    inferred_type = "video" if extension in SUPPORTED_VIDEO_EXTENSIONS else "image"
                    if declared_type != inferred_type:
                        self.error(
                            file,
                            f"{location}.type",
                            f"Declared type {declared_type!r} conflicts with {extension} filename.",
                        )

            media_era = raw.get("era")
            if media_era is not None:
                if not isinstance(media_era, str) or not media_era.strip():
                    self.error(file, f"{location}.era", "Era must be a non-empty string when present.")
                elif event_id in event_map and media_era != event_map[event_id].get("era"):
                    self.error(
                        file,
                        f"{location}.era",
                        f"Media era {media_era!r} does not match linked event era {event_map[event_id].get('era')!r}.",
                    )

            poster = raw.get("poster")
            poster_path = raw.get("posterPath")
            if poster is not None or poster_path is not None:
                if not isinstance(poster, str) or not poster.strip():
                    self.error(file, f"{location}.poster", "Poster must be a non-empty filename.")
                if not isinstance(poster_path, str) or not poster_path.strip():
                    self.error(file, f"{location}.posterPath", "posterPath must be a non-empty path.")
                elif isinstance(poster, str):
                    self.validate_media_path(poster_path, poster, available, file, location, field="posterPath")

        self.check_duplicates(ids, file, "$.media", "media ID")
        self.check_duplicates(orders, file, "$.media", "media order")
        self.check_duplicates(files, file, "$.media", "filename")
        self.check_duplicates(paths, file, "$.media", "media path")

    def validate_media_path(
        self,
        path_value: str,
        filename: str,
        available: Any,
        file: str,
        location: str,
        field: str = "path",
    ) -> None:
        path_location = f"{location}.{field}"
        posix_path = PurePosixPath(path_value)
        if posix_path.is_absolute() or ".." in posix_path.parts:
            self.error(file, path_location, "Path must be a safe repository-relative path.")
            return
        if not path_value.startswith("assets/media/"):
            self.error(file, path_location, "Media paths must begin with 'assets/media/'.")
        if filename and posix_path.name != filename:
            self.error(file, path_location, f"Path filename {posix_path.name!r} does not match file {filename!r}.")

        if self.check_files and isinstance(available, bool):
            disk_path = self.root.joinpath(*posix_path.parts)
            if available and not disk_path.is_file():
                self.error(file, path_location, "Record is marked available, but the file is missing from the repository.")
            elif not available and disk_path.is_file():
                self.warning(file, path_location, "File exists, but the record is marked unavailable.")

    def validate_people_references(
        self,
        references: list[str],
        people_ids: set[str],
        file: str,
        location: str,
    ) -> None:
        self.check_duplicates(references, file, location, "person reference")
        for index, person_id in enumerate(references):
            if person_id not in people_ids:
                self.error(file, f"{location}[{index}]", f"Unknown person ID {person_id!r}.")

    def string_array(self, obj: dict[str, Any], key: str, file: str, location: str) -> list[str]:
        value = obj.get(key)
        if not isinstance(value, list):
            self.error(file, f"{location}.{key}", "Expected an array.")
            return []
        result: list[str] = []
        for index, item in enumerate(value):
            if not isinstance(item, str) or not item.strip():
                self.error(file, f"{location}.{key}[{index}]", "Expected a non-empty string.")
            else:
                result.append(item)
        return result

    def required_string(self, obj: dict[str, Any], key: str, file: str, location: str) -> str:
        value = obj.get(key)
        if not isinstance(value, str) or not value.strip():
            self.error(file, f"{location}.{key}", "Expected a non-empty string.")
            return ""
        return value

    def validate_id(self, value: str, file: str, location: str) -> None:
        if not ID_PATTERN.fullmatch(value):
            self.error(file, location, "IDs may contain only lowercase letters, numbers, and hyphens.")

    def parse_date(self, value: str, file: str, location: str) -> date | None:
        try:
            return date.fromisoformat(value)
        except ValueError:
            self.error(file, location, "Expected an ISO date in YYYY-MM-DD format.")
            return None

    def parse_datetime(self, value: str, file: str, location: str) -> datetime | None:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            self.error(file, location, "Expected an ISO date-time such as YYYY-MM-DDTHH:MM:SS.")
            return None

    def validate_era_date(self, event_date: date, era: str, file: str, location: str) -> None:
        era_years = {int(value) for value in YEAR_PATTERN.findall(era)}
        if era_years and event_date.year not in era_years:
            self.error(file, location, f"Era year {sorted(era_years)} conflicts with event year {event_date.year}.")
            return

        month_ranges = {
            "Summer": range(6, 9),
            "Fall": range(9, 13),
            "Winter": range(1, 3),
            "Spring": range(3, 6),
        }
        for season, months in month_ranges.items():
            if season in era and event_date.month not in months:
                self.error(
                    file,
                    location,
                    f"{season} era conflicts with month {event_date.month} in event date {event_date.isoformat()}.",
                )
                break

    def check_duplicates(
        self,
        values: Iterable[Any],
        file: str,
        location: str,
        label: str,
        severity: str = "error",
    ) -> None:
        seen: dict[Any, int] = {}
        for index, value in enumerate(values):
            if value in seen:
                message = f"Duplicate {label} {value!r}; first occurrence was at index {seen[value]}."
                if severity == "warning":
                    self.warning(file, f"{location}[{index}]", message)
                else:
                    self.error(file, f"{location}[{index}]", message)
            else:
                seen[value] = index

    def report(self, strict_warnings: bool) -> int:
        errors = [item for item in self.findings if item.severity == "error"]
        warnings = [item for item in self.findings if item.severity == "warning"]

        for item in self.findings:
            prefix = "ERROR" if item.severity == "error" else "WARNING"
            print(f"{prefix}: {item.file} {item.location}: {item.message}")

        print()
        print(f"Archive validation complete: {len(errors)} error(s), {len(warnings)} warning(s).")
        if errors or (strict_warnings and warnings):
            return 1
        return 0


def parse_args() -> argparse.Namespace:
    default_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=default_root, help="Repository root to validate.")
    parser.add_argument(
        "--check-files",
        action="store_true",
        help="Verify that media marked available exists under assets/media/.",
    )
    parser.add_argument(
        "--strict-warnings",
        action="store_true",
        help="Return a failing exit code when warnings are present.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validator = Validator(args.root.resolve(), args.check_files)
    validator.validate()
    return validator.report(args.strict_warnings)


if __name__ == "__main__":
    sys.exit(main())

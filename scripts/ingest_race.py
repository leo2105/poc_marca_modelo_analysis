#!/usr/bin/env python3
"""Genera JSON de una carrera para la consola de validación multi-evento."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_annotations(csv_path: Path) -> dict[str, dict[str, object]]:
    annotations: dict[str, dict[str, object]] = {}
    with csv_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            person_id = (row.get("person_id") or "").strip()
            if not person_id:
                continue
            try:
                score = float(row.get("score") or 0)
            except ValueError:
                score = 0.0
            annotations[person_id] = {
                "brand": (row.get("marca") or "").strip(),
                "model": (row.get("modelo") or "").strip(),
                "score": score,
            }
    return annotations


def sprite_files(sprite_dir: Path | None, annotations: dict[str, dict[str, object]]) -> list[str]:
    if sprite_dir and sprite_dir.is_dir():
        files = sorted(path.name for path in sprite_dir.glob("person_*.jpg"))
        if files:
            return files
    return [f"{person_id}.jpg" for person_id in annotations]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-id", required=True)
    parser.add_argument("--csv", required=True, type=Path)
    parser.add_argument("--sprite-dir", type=Path)
    args = parser.parse_args()

    csv_path = args.csv.resolve()
    if not csv_path.is_file():
        raise SystemExit(f"No existe CSV: {csv_path}")

    annotations = load_annotations(csv_path)
    files = sprite_files(args.sprite_dir, annotations)

    generated_dir = ROOT / "src" / "data" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "eventId": args.event_id,
        "spriteFiles": files,
        "annotations": annotations,
    }
    out_json = generated_dir / f"{args.event_id}.json"
    out_json.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"json -> {out_json} ({len(files)} sprites, {len(annotations)} labels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

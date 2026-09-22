#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
for pattern in ("scripts/*.sh", ".env", ".env.example"):
    for path in root.glob(pattern):
        text = path.read_text(encoding="utf-8")
        fixed = text.replace("\r\n", "\n").replace("\r", "\n")
        if fixed != text:
            path.write_text(fixed, encoding="utf-8", newline="\n")
            print(f"fixed: {path.relative_to(root)}")

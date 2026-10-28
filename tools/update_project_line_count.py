#!/usr/bin/env python3
"""Update the About Us line and file counts before publishing the static site."""
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "js" / "app.js"
COUNT_PATTERN = re.compile(r"(const PROJECT_LINE_COUNT=)\d+(,PROJECT_FILE_COUNT=)\d+;")
GENERATED_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "_site", "dist", "build"}


def count_project_text():
    """Return (lines, files) over every UTF-8 text file of the project."""
    total = 0
    files = 0
    for directory, subdirectories, filenames in os.walk(ROOT):
        subdirectories[:] = [name for name in subdirectories if name not in GENERATED_DIRS]
        for filename in filenames:
            path = pathlib.Path(directory) / filename
            try:
                content = path.read_bytes().decode("utf-8-sig")
            except UnicodeDecodeError:
                continue
            if "\0" not in content:
                total += len(content.splitlines())
                files += 1
    return total, files


def main():
    total, files = count_project_text()
    app_source = APP.read_bytes().decode("utf-8")
    updated, replacements = COUNT_PATTERN.subn(rf"\g<1>{total}\g<2>{files};", app_source)
    if replacements != 1:
        sys.exit(f"Expected one PROJECT_LINE_COUNT/PROJECT_FILE_COUNT constant pair in {APP.relative_to(ROOT)}.")
    APP.write_bytes(updated.encode("utf-8"))
    print(f"Updated About Us counts: {total} lines in {files} text files")


if __name__ == "__main__":
    main()

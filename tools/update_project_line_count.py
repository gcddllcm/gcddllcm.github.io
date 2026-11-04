#!/usr/bin/env python3
"""Update the About Us character, line and file counts before publishing."""
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "js" / "app.js"
CHARACTER_COUNT_PATTERN = re.compile(r"(const PROJECT_CHARACTER_COUNT=)\d+;")
COUNT_PATTERN = re.compile(r"(const PROJECT_LINE_COUNT=)\d+(,PROJECT_FILE_COUNT=)\d+;")
GENERATED_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "_site", "dist", "build"}


def count_project_text():
    """Return (characters, lines, files) over every UTF-8 text file of the project.

    Characters are Unicode code points, including spaces and line endings. A UTF-8
    BOM is ignored; binary files and generated dependency/build folders are excluded.
    """
    characters = 0
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
                characters += len(content)
                total += len(content.splitlines())
                files += 1
    return characters, total, files


def main():
    characters, total, files = count_project_text()
    app_source = APP.read_bytes().decode("utf-8")
    updated, character_replacements = CHARACTER_COUNT_PATTERN.subn(rf"\g<1>{characters};", app_source)
    updated, count_replacements = COUNT_PATTERN.subn(rf"\g<1>{total}\g<2>{files};", updated)
    if character_replacements != 1 or count_replacements != 1:
        sys.exit(f"Expected one PROJECT_LINE_COUNT/PROJECT_FILE_COUNT constant pair in {APP.relative_to(ROOT)}.")
    APP.write_bytes(updated.encode("utf-8"))
    print(f"Updated About Us counts: {characters:,} characters, {total:,} lines in {files:,} text files")


if __name__ == "__main__":
    main()

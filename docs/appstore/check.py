#!/usr/bin/env python3
"""Checks docs/appstore/listing.md against App Store Connect's field limits.

Usage: python3 docs/appstore/check.py
"""
import re
import sys
from pathlib import Path

LIMITS = {"Name": 30, "Subtitle": 30, "Promotional text": 170, "Keywords": 100,
          "Description": 4000, "What's New": 4000, "Что нового": 4000}
# Apple rejects other companies' trademarks in these fields (guideline 2.3.7).
NO_TRADEMARKS = {"Name", "Subtitle", "Keywords"}
TRADEMARKS = re.compile(r"youtube|google|ublock|adguard|1blocker|wipr|vinegar", re.I)

text = (Path(__file__).parent / "listing.md").read_text()
failed = False
for lang_block in re.split(r"\n## ", text)[1:]:
    lang = lang_block.splitlines()[0].strip()
    if lang.startswith("App information"):
        continue
    # A field is "**Label** (limit):" (or "**Label**:"), then its value up to the next field.
    for m in re.finditer(r"\*\*(.+?)\*\*(?: \([^)]*\))?:\n(.*?)(?=\n\*\*|\n---|\Z)", lang_block, re.S):
        label, value = m.group(1), m.group(2).strip()
        limit = LIMITS.get(label)
        if limit is None:
            continue
        n = len(value)
        problems = []
        if n > limit:
            problems.append(f"over by {n - limit}")
        if label == "Keywords" and ", " in value:
            problems.append("spaces after commas waste characters")
        if label in NO_TRADEMARKS and TRADEMARKS.search(value):
            problems.append(f"trademark: {TRADEMARKS.search(value).group(0)}")
        failed |= bool(problems)
        print(f"{'✗' if problems else '✓'} {lang[:18]:18} {label:17} {n:5}/{limit}  {'; '.join(problems)}")
sys.exit(1 if failed else 0)

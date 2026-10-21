#!/usr/bin/env python3
"""Replay every synthetic fixture through the pipeline and diff against expected."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from uw.pipeline import process_packet  # noqa: E402


def summarize(report):
    return {
        "missing_documents": report.missing_documents,
        "conflict_keys": [c.key for c in report.conflicts],
        "injection_flags": len(report.injection_flags),
        "checklist_passed": report.checklist.passed,
    }


def main() -> int:
    failures = 0
    for path in sorted((ROOT / "fixtures" / "synthetic").glob("*.json")):
        case = json.loads(path.read_text())
        actual = summarize(process_packet(case["packet"]))
        if actual != case["expected"]:
            failures += 1
            print(f"FAIL {path.name}\n  expected {case['expected']}\n  actual   {actual}")
        else:
            print(f"ok   {path.name}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

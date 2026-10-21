"""Deterministic steps that run after (model-based) extraction.

Extraction itself is out of scope here: packets carry the facts an extractor
returned, each with a citation. Everything downstream is plain, tested code.
"""
from __future__ import annotations

import re
from typing import Any

from .models import Citation, CaseReport, Conflict, Fact
from .policy import CHECKLIST_V1, evaluate

# Weak first layer only: flags instruction-like text found inside documents so a
# human looks at it. It is not a security boundary; see docs/access-model.md.
_INJECTION = re.compile(
    r"ignore (all |any )?(previous|prior) instructions|"
    r"(mark|set|approve)\b.{0,40}\b(approved|approve)\b|"
    r"disregard .{0,30}(polic|rule)|you are now",
    re.IGNORECASE,
)


def _norm(value: str) -> str:
    v = value.strip().casefold()
    v = re.sub(r"[,$\s]", "", v) if re.fullmatch(r"[\d,.$\s]+", v) else re.sub(r"\s+", " ", v)
    return v


def parse_facts(raw: list[dict[str, Any]]) -> list[Fact]:
    return [
        Fact(f["key"], f["value"], Citation(**f["citation"])) for f in raw
    ]


def find_missing(packet: dict[str, Any], required: list[str]) -> list[str]:
    present = {d["type"] for d in packet["documents"]}
    return sorted(set(required) - present)


def find_conflicts(facts: list[Fact]) -> list[Conflict]:
    by_key: dict[str, list[Fact]] = {}
    for f in facts:
        by_key.setdefault(f.key, []).append(f)
    out = []
    for key, group in sorted(by_key.items()):
        if len({_norm(f.value) for f in group}) > 1:
            out.append(Conflict(key, group))
    return out


def scan_injection(packet: dict[str, Any]) -> list[dict[str, Any]]:
    flags = []
    for d in packet["documents"]:
        for page, text in enumerate(d.get("pages", []), start=1):
            if _INJECTION.search(text):
                flags.append({"doc_id": d["id"], "page": page})
    return flags


def process_packet(packet: dict[str, Any]) -> CaseReport:
    facts = parse_facts(packet["facts"])
    return CaseReport(
        case_ref=packet["case_ref"],
        missing_documents=find_missing(packet, CHECKLIST_V1.required_documents),
        conflicts=find_conflicts(facts),
        injection_flags=scan_injection(packet),
        checklist=evaluate(CHECKLIST_V1, facts),
    )

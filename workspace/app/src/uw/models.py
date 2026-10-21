from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass(frozen=True)
class Citation:
    doc_id: str
    doc_version: int
    page: int
    passage: str


@dataclass(frozen=True)
class Fact:
    key: str
    value: str
    citation: Citation


@dataclass
class Conflict:
    key: str
    facts: list[Fact]
    status: str = "open"  # open | resolved


@dataclass
class RuleResult:
    rule_id: str
    outcome: str  # pass | fail | needs_review
    inputs: dict[str, Any]
    detail: str


@dataclass
class ChecklistResult:
    policy_version: str
    results: list[RuleResult]

    @property
    def passed(self) -> bool:
        return all(r.outcome == "pass" for r in self.results)


@dataclass
class CaseReport:
    case_ref: str
    missing_documents: list[str]
    conflicts: list[Conflict]
    injection_flags: list[dict[str, Any]]
    checklist: ChecklistResult
    status: str = "needs_review"  # the pipeline never auto-decides

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

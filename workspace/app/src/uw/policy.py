"""Versioned, deterministic checklist. PLACEHOLDER rules until the underwriting
domain and the real approved policy are chosen (see docs/decisions/0002)."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from .models import ChecklistResult, Fact, RuleResult


@dataclass(frozen=True)
class Checklist:
    version: str
    required_documents: list[str]
    required_facts: list[str]
    max_requested_amount: Decimal


CHECKLIST_V1 = Checklist(
    version="1.0.0-placeholder",
    required_documents=["application_form", "identity_document", "income_statement"],
    required_facts=["applicant_name", "requested_amount"],
    max_requested_amount=Decimal("100000"),
)


def _amount(value: str) -> Decimal | None:
    try:
        return Decimal(value.replace(",", "").replace("$", "").strip())
    except InvalidOperation:
        return None


def evaluate(cl: Checklist, facts: list[Fact]) -> ChecklistResult:
    values: dict[str, set[str]] = {}
    for f in facts:
        values.setdefault(f.key, set()).add(f.value)
    results = []
    for key in cl.required_facts:
        ok = key in values
        results.append(RuleResult(f"fact_present:{key}", "pass" if ok else "fail",
                                  {"key": key}, "found" if ok else "no extracted value"))
    vals = values.get("requested_amount", set())
    amounts = {_amount(v) for v in vals}
    if len(vals) != 1 or None in amounts:
        results.append(RuleResult("amount_within_limit", "needs_review",
                                  {"values": sorted(vals)}, "absent, unparseable or conflicting"))
    else:
        amt = amounts.pop()
        ok = amt <= cl.max_requested_amount
        results.append(RuleResult("amount_within_limit", "pass" if ok else "fail",
                                  {"amount": str(amt), "max": str(cl.max_requested_amount)},
                                  "within limit" if ok else "exceeds limit"))
    return ChecklistResult(cl.version, results)

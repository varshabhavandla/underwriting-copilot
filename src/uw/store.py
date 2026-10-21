"""In-memory reference for the access and integrity rules in docs/access-model.md.
A real database must enforce the same rules; tests here define the contract."""
from __future__ import annotations

import hashlib
from typing import Any

ROLES_THAT_CAN_DECIDE = {"underwriter"}


class AccessDenied(Exception):
    pass


def idempotency_key(org_id: str, case_ref: str, doc_hashes: list[str]) -> str:
    raw = "|".join([org_id, case_ref, *sorted(doc_hashes)])
    return hashlib.sha256(raw.encode()).hexdigest()


class CaseStore:
    def __init__(self) -> None:
        self._cases: dict[str, dict[str, Any]] = {}
        self._by_key: dict[str, str] = {}

    def create_case(self, org_id: str, case_ref: str, doc_hashes: list[str]) -> str:
        key = idempotency_key(org_id, case_ref, doc_hashes)
        if key in self._by_key:  # retried job: return the existing case
            return self._by_key[key]
        case_id = f"case_{len(self._cases) + 1}"
        self._cases[case_id] = {"org_id": org_id, "case_ref": case_ref, "decisions": []}
        self._by_key[key] = case_id
        return case_id

    def get_case(self, org_id: str, case_id: str) -> dict[str, Any]:
        case = self._cases.get(case_id)
        if case is None or case["org_id"] != org_id:  # same error: don't leak existence
            raise AccessDenied("case not found")
        return case

    def record_decision(self, org_id: str, case_id: str, reviewer: str, role: str,
                        decision: str, reasons: list[str], policy_version: str,
                        overrides: list[str] | None = None) -> None:
        case = self.get_case(org_id, case_id)
        if role not in ROLES_THAT_CAN_DECIDE:
            raise AccessDenied("role cannot record decisions")
        if not reasons:
            raise ValueError("a decision needs at least one reason")
        case["decisions"].append({  # append-only: never edited or removed
            "reviewer": reviewer, "decision": decision, "reasons": reasons,
            "policy_version": policy_version, "overrides": overrides or [],
        })

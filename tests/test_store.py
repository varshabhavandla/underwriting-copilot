import unittest

from uw.store import AccessDenied, CaseStore


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.s = CaseStore()
        self.cid = self.s.create_case("orgA", "SYN-1", ["h1", "h2"])

    def test_retry_does_not_duplicate_case(self):
        self.assertEqual(self.s.create_case("orgA", "SYN-1", ["h2", "h1"]), self.cid)

    def test_other_org_cannot_read(self):
        with self.assertRaises(AccessDenied):
            self.s.get_case("orgB", self.cid)

    def test_missing_and_foreign_cases_look_identical(self):
        with self.assertRaises(AccessDenied) as a:
            self.s.get_case("orgB", self.cid)
        with self.assertRaises(AccessDenied) as b:
            self.s.get_case("orgB", "nope")
        self.assertEqual(str(a.exception), str(b.exception))

    def test_only_underwriter_decides(self):
        with self.assertRaises(AccessDenied):
            self.s.record_decision("orgA", self.cid, "bob", "viewer", "approve", ["ok"], "v1")

    def test_decision_requires_reason_and_is_recorded(self):
        with self.assertRaises(ValueError):
            self.s.record_decision("orgA", self.cid, "amy", "underwriter", "approve", [], "v1")
        self.s.record_decision("orgA", self.cid, "amy", "underwriter", "approve", ["docs complete"], "v1", ["waived x"])
        d = self.s.get_case("orgA", self.cid)["decisions"]
        self.assertEqual(d[0]["policy_version"], "v1")
        self.assertEqual(d[0]["overrides"], ["waived x"])


if __name__ == "__main__":
    unittest.main()

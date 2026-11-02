import { describe, expect, it } from "vitest";
import { eventsVersion, live, sessionsVersion, usersVersion } from "../../src/admin/live";
import type { SecurityEvent, SessionRow, UserRow } from "../../src/admin/queries";

const user = (o: Partial<UserRow> = {}): UserRow => ({ id: "u1", email: "a@example.test", role: "viewer", disabled: false, issuer: null, subject: null, sessions: 0, last_seen: null, ...o });
const event = (seq: string): SecurityEvent => ({ seq, at: "2026-11-02 10:00:00", action: "auth.login", actor: null, subject: {} });
const session = (o: Partial<SessionRow> = {}): SessionRow => ({ id: "s1", created_at: "t", last_seen_at: "t", expires_at: "t", user_agent: null, is_current: false, ...o });

describe("users change token", () => {
  it("is stable for the same data", () => expect(usersVersion([user()])).toBe(usersVersion([user()])));
  it("changes when a role, status, linked identity, session count or the set of users changes", () => {
    const base = usersVersion([user()]);
    for (const changed of [user({ role: "admin" }), user({ disabled: true }), user({ issuer: "https://idp.test", subject: "sub-1" }), user({ sessions: 2 })]) expect(usersVersion([changed])).not.toBe(base);
    expect(usersVersion([user(), user({ id: "u2" })])).not.toBe(base);
    expect(usersVersion([user({ subject: "sub-2", issuer: "https://idp.test" })])).not.toBe(usersVersion([user({ subject: "sub-1", issuer: "https://idp.test" })]));
  });
  it("ignores last-seen times and email addresses, so it does not change on every request and leaks no address", () => {
    expect(usersVersion([user({ last_seen: "2026-11-02 11:00:00" })])).toBe(usersVersion([user()]));
    expect(usersVersion([user({ email: "someone.else@example.test" })])).toBe(usersVersion([user()]));
    expect(usersVersion([user({ email: "someone.else@example.test" })])).not.toContain("example");
  });
});

describe("security events change token", () => {
  it("changes when a newer event is recorded and not otherwise", () => {
    expect(eventsVersion([event("11"), event("10")])).not.toBe(eventsVersion([event("10")]));
    expect(eventsVersion([event("11"), event("10")])).toBe(eventsVersion([event("11")]));
  });
  it("is defined when there are no events yet", () => expect(eventsVersion([])).toMatch(/^[0-9a-f]{16}$/));
});

describe("sessions change token", () => {
  it("changes when a session is added, ended or becomes the current one", () => {
    const base = sessionsVersion([session({ is_current: true })]);
    expect(sessionsVersion([session({ is_current: true }), session({ id: "s2" })])).not.toBe(base);
    expect(sessionsVersion([session({ id: "s9", is_current: true })])).not.toBe(base);
    expect(sessionsVersion([session({ is_current: false })])).not.toBe(base);
  });
  it("ignores last-active times", () => expect(sessionsVersion([session({ last_seen_at: "later" })])).toBe(sessionsVersion([session()])));
});

describe("the route payload", () => {
  it("is a version and an idle flag only", () => expect(live("abc")).toEqual({ version: "abc", active: false }));
});

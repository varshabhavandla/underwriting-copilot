import { describe, expect, it } from "vitest";
import { statusLabel, usd, usdCompact } from "../../app/format";

describe("dashboard formatting", () => {
  it("shows whole dollars from integer cents", () => {
    expect(usd("25000000")).toBe("$250,000");
    expect(usd("123456789012")).toBe("$1,234,567,890");
    expect(usd(null)).toBe("n/a");
  });
  it("shortens headline volumes", () => {
    expect(usdCompact(0n)).toBe("$0");
    expect(usdCompact(99_900n)).toBe("$999");
    expect(usdCompact(25_000_000n)).toBe("$250K");
    expect(usdCompact(150_000_000n)).toBe("$1.5M");
    expect(usdCompact(100_000_000n)).toBe("$1M");
  });
  it("handles amounts beyond the safe float range without throwing", () => {
    expect(usdCompact(10n ** 18n)).toMatch(/^\$[\d.e+]+M$/);
  });
  it("labels the case statuses and falls back readably for an unknown one", () => {
    expect(statusLabel("needs_review")).toBe("Needs review");
    expect(statusLabel("handed_off")).toBe("Handed off");
    expect(statusLabel("some_new_status")).toBe("some new status");
  });
});

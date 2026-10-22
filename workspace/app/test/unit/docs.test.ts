import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderRulePackDoc } from "../../scripts/rule-pack-doc";

describe("generated documentation", () => {
  it("workspace/docs/RULE_PACK.md is current (run `npm run docs:rules` if this fails)", () => {
    const committed = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "RULE_PACK.md"), "utf8");
    expect(committed).toBe(renderRulePackDoc());
  });
});

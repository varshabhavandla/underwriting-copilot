import { z } from "zod";
import { parseAmountToCents } from "../money";

const ein = z.string().regex(/^\d{2}-?\d{7}$/, "EIN must be 9 digits");

export const ApplicationInput = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    entityType: z.enum(["sole_proprietorship", "partnership", "llc", "s_corp", "c_corp", "nonprofit", "other"]),
    ein,
    naics: z.string().regex(/^\d{6}$/, "NAICS must be 6 digits"),
    yearsInBusiness: z.number().int().min(0).max(300),
    requestedTermMonths: z.number().int().min(1).max(360),
    loanAmount: z.string().transform((s, ctx) => {
      const c = parseAmountToCents(s);
      if (c === null || c <= 0n) {
        ctx.addIssue({ code: "custom", message: "loan amount must be a positive dollar amount" });
        return z.NEVER;
      }
      return c;
    }),
    purposes: z.array(z.enum(["working_capital", "equipment", "real_estate", "refinance", "change_of_ownership", "inventory", "other"])).min(1),
    owners: z
      .array(z.object({ name: z.string().trim().min(1).max(200), percent: z.number().min(0.01).max(100) }))
      .min(1)
      .max(50),
    certifyAccurate: z.literal(true, { message: "applicant must certify the information is accurate" }),
  })
  .superRefine((v, ctx) => {
    // SBA SOP 50 10 8.1, App. 20: listed ownership percentages must total 100 percent.
    const total = Math.round(v.owners.reduce((s, o) => s + o.percent, 0) * 100) / 100;
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["owners"], message: `ownership must total 100 percent (got ${total})` });
  });

export type ApplicationInputT = z.output<typeof ApplicationInput>;

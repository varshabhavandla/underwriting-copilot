export type DocType = "tax_return" | "bank_statement" | "financial_statement";
export type FieldKind = "money" | "int" | "date";

export interface FieldSpec {
  field: string;
  kind: FieldKind;
  /** Printed label on synthetic documents; real providers do not need it. */
  label: string;
}

/** Allowlist per document type. A provider may only return these fields; anything else is rejected. */
export const SCHEMAS: Record<DocType, FieldSpec[]> = {
  tax_return: [
    { field: "tax_year", kind: "int", label: "Tax year" },
    { field: "gross_receipts", kind: "money", label: "Gross receipts" },
    { field: "officer_compensation", kind: "money", label: "Officer compensation" },
    { field: "depreciation", kind: "money", label: "Depreciation" },
    { field: "interest_expense", kind: "money", label: "Interest expense" },
    { field: "net_income", kind: "money", label: "Net income" },
  ],
  bank_statement: [
    { field: "period_end", kind: "date", label: "Statement period ending" },
    { field: "beginning_balance", kind: "money", label: "Beginning balance" },
    { field: "total_deposits", kind: "money", label: "Total deposits" },
    { field: "total_withdrawals", kind: "money", label: "Total withdrawals" },
    { field: "ending_balance", kind: "money", label: "Ending balance" },
  ],
  financial_statement: [
    { field: "statement_date", kind: "date", label: "As of" },
    { field: "revenue", kind: "money", label: "Revenue" },
    { field: "net_income", kind: "money", label: "Net income" },
    { field: "total_assets", kind: "money", label: "Total assets" },
    { field: "total_liabilities", kind: "money", label: "Total liabilities" },
    { field: "total_equity", kind: "money", label: "Total equity" },
  ],
};

export const DOC_TYPES = Object.keys(SCHEMAS) as DocType[];
export const fieldKey = (docType: DocType, field: string): string => `${docType}.${field}`;
export const specFor = (docType: DocType, field: string): FieldSpec | undefined => SCHEMAS[docType].find((f) => f.field === field);

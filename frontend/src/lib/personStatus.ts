import type { PersonStatus, SignerField } from "../types";

/** Aggregate per-signer completion from the signer document's field list. */
export function personsFromSignerFields(fields: SignerField[]): PersonStatus[] {
  const acc = new Map<string, { total: number; signed: number }>();
  for (const f of fields) {
    const name = (f.signer_name || "").trim();
    if (!name) continue;
    const a = acc.get(name) ?? { total: 0, signed: 0 };
    a.total += 1;
    if (f.signed) a.signed += 1;
    acc.set(name, a);
  }
  return [...acc.entries()].map(([name, a]) => ({
    name,
    total: a.total,
    signed: a.signed,
    done: a.total > 0 && a.signed >= a.total,
  }));
}

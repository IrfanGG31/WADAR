import { emitEvent, type Tx } from "@wadar/platform";
import type { PostingEntry } from "../domain/posting.js";
import { insertEntry, type Ledger } from "../infra/ledger.repository.js";

/** Source types that move money between the store's own pockets — not income/spending. */
const NON_CASHFLOW_SOURCES = new Set(["transfer", "wallet_opening", "wallet_adjustment"]);

export interface PostOptions {
  tenantId: string;
  ledger: Ledger;
  occurredAt: Date;
  sourceType: string;
  sourceId: string;
  createdBy: string;
  correlationId: string;
  causationId?: string;
  reversalOf?: { entryId: string; occurredAt: Date };
}

/**
 * The only way anything is written to the journal: insert (idempotent on
 * source) and emit `finance.entry.posted` in the same transaction, with each
 * line tagged by account kind so insights can build the dashboard without
 * ever querying the ledger tables (ARCHITECTURE §5.4).
 */
export async function postAndEmit(tx: Tx, entry: PostingEntry, options: PostOptions): Promise<string | undefined> {
  if (entry.lines.length === 0) return undefined;
  const entryId = await insertEntry(tx, {
    tenantId: options.tenantId,
    occurredAt: options.occurredAt,
    sourceType: options.sourceType,
    sourceId: options.sourceId,
    description: entry.description,
    reversalOf: options.reversalOf?.entryId,
    createdBy: options.createdBy,
    lines: entry.lines,
  });
  if (!entryId) return undefined;
  const walletByAccount = new Map(options.ledger.wallets.map((w) => [w.accountId, w.id]));
  await emitEvent(tx, {
    type: "finance.entry.posted",
    tenantId: options.tenantId,
    aggregateType: "journal_entry",
    aggregateId: entryId,
    correlationId: options.correlationId,
    causationId: options.causationId,
    actor: { kind: "system", id: "finance" },
    payload: {
      entryId,
      occurredAt: options.occurredAt.toISOString(),
      sourceType: options.sourceType,
      sourceId: options.sourceId,
      description: entry.description,
      cashflow: !NON_CASHFLOW_SOURCES.has(options.sourceType),
      reversalOfOccurredAt: options.reversalOf?.occurredAt.toISOString() ?? null,
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        accountCode: options.ledger.accountById.get(line.accountId)!.code,
        kind: options.ledger.accountById.get(line.accountId)!.kind,
        walletId: walletByAccount.get(line.accountId) ?? null,
        debit: line.debit,
        credit: line.credit,
      })),
    },
  });
  return entryId;
}

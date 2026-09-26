-- Ledger invariants enforced by Postgres itself, not just application code
-- (BUILD-PLAN M4 DoD: "Setiap entry seimbang (constraint DB + tes)";
-- CLAUDE.md aturan #3/#4). Deferred so an entry's lines can be inserted one
-- by one inside a transaction and are checked together at COMMIT.
CREATE OR REPLACE FUNCTION finance.assert_entry_balanced(target_entry uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  total_debit bigint;
  total_credit bigint;
  line_count int;
BEGIN
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    INTO total_debit, total_credit, line_count
    FROM finance.journal_lines
   WHERE entry_id = target_entry;
  IF line_count < 2 OR total_debit <> total_credit THEN
    RAISE EXCEPTION 'journal entry % is unbalanced (debit %, credit %, % lines)', target_entry, total_debit, total_credit, line_count
      USING ERRCODE = '23514';
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance.check_line_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.assert_entry_balanced(NEW.entry_id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance.check_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM finance.assert_entry_balanced(NEW.id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON finance.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION finance.check_line_entry_balanced();
--> statement-breakpoint
-- Also catches an entry header committed with no lines at all.
CREATE CONSTRAINT TRIGGER journal_entries_balanced
  AFTER INSERT ON finance.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION finance.check_entry_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finance.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'finance.% is append-only: post a reversing entry instead', TG_TABLE_NAME
    USING ERRCODE = '42501';
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON finance.journal_entries
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON finance.journal_lines
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER expenses_append_only BEFORE UPDATE OR DELETE ON finance.expenses
  FOR EACH ROW EXECUTE FUNCTION finance.forbid_mutation();

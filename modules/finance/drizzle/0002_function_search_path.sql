-- Pin search_path on the ledger trigger functions (Supabase security advisor
-- 0011 function_search_path_mutable): with a caller-controlled search_path a
-- role could shadow objects the function resolves by name. Every table here
-- is already schema-qualified (finance.journal_lines) and sum/count/coalesce
-- live in pg_catalog, which is always searched, so an empty path is safe.
ALTER FUNCTION finance.assert_entry_balanced(uuid) SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION finance.check_line_entry_balanced() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION finance.check_entry_balanced() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION finance.forbid_mutation() SET search_path = '';

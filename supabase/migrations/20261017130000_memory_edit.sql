-- CON-4 "Yang WADAR tahu": the owner may correct or forget a saved Konsultasi note.
-- Only the text changes (kind / pinned / tenant stay); RLS `tenant_rw` (app.is_member)
-- already scopes UPDATE and DELETE to the member's own shop. NOT yet applied to hosted.
grant update (content) on public.memory_items to authenticated;
grant delete on public.memory_items to authenticated;

-- Add 'fonnte' to the allowed channel kinds so Fonnte WhatsApp gateway connections can be stored.

ALTER TABLE channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_kind_check,
  ADD  CONSTRAINT channel_connections_kind_check CHECK (kind IN ('telegram', 'whatsapp', 'fonnte'));

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check,
  ADD  CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'widget', 'telegram', 'api', 'fonnte'));

-- Preserve the original reservation and audit why it no longer consumes allowance.
ALTER TABLE chorus_live_reservations ADD COLUMN released_at timestamptz;
ALTER TABLE chorus_live_reservations ADD COLUMN release_reason text
 CHECK (release_reason IN ('rejected-before-acceptance','finalized-zero-cost'));
ALTER TABLE chorus_live_reservations ADD CONSTRAINT chorus_release_audit
 CHECK ((released_at IS NULL) = (release_reason IS NULL));

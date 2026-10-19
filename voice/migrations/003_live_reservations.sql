-- No mission foreign key: deleting a mission must not reset the total authorized spend.
CREATE TABLE chorus_live_reservations (
 id uuid PRIMARY KEY,
 authorization_id text NOT NULL,
 mission_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('phone','browser')),
 reserve_minor integer NOT NULL CHECK (reserve_minor > 0),
 reserved_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL
);
CREATE INDEX chorus_live_authorization_idx ON chorus_live_reservations(authorization_id);
CREATE INDEX chorus_browser_lease_idx ON chorus_live_reservations(lease_until) WHERE kind='browser';
ALTER TABLE chorus_live_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chorus_live_reservations FROM PUBLIC;

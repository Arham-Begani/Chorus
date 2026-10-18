CREATE TABLE IF NOT EXISTS chorus_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chorus_missions (
 id uuid PRIMARY KEY, owner_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('real','simulation')),
 status text NOT NULL, revision integer NOT NULL CHECK(revision>0), state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chorus_owner_idx ON chorus_missions(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS chorus_entities (
 mission_id uuid NOT NULL REFERENCES chorus_missions(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('revision','task','dependency','contact','attempt','observation','offer','approval','conflict')),
 id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(mission_id,kind,id)
);
CREATE INDEX IF NOT EXISTS chorus_entity_kind_idx ON chorus_entities(kind,mission_id);
CREATE TABLE IF NOT EXISTS chorus_events (
 id uuid PRIMARY KEY, mission_id uuid NOT NULL REFERENCES chorus_missions(id) ON DELETE CASCADE,
 type text NOT NULL, mode text NOT NULL, revision integer NOT NULL, at timestamptz NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS chorus_events_mission_idx ON chorus_events(mission_id,at);
-- Web/worker use a private database role. Never expose these tables via an anon PostgREST role.
ALTER TABLE chorus_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chorus_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE chorus_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chorus_missions,chorus_entities,chorus_events FROM PUBLIC;

#!/usr/bin/env bash
# Exercise a complete PostgreSQL archive in a disposable database inside an existing container.
# No production database, role, archive or volume is deleted by this rehearsal.
set -euo pipefail
container=${1:?Usage: bash scripts/verify-backup.sh POSTGRES_CONTAINER [SOURCE_DATABASE] [DATABASE_USER]}
source_database=${2:-chorus}
database_user=${3:-chorus}
restore_database="chorus_restore_check_$(date +%s)_${RANDOM}"
archive=$(mktemp)
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    docker exec "$container" dropdb --username "$database_user" --if-exists "$restore_database"
  fi
  rm -f -- "$archive"
}
trap cleanup EXIT
fingerprint() {
  docker exec "$container" psql --username "$database_user" --dbname "$1" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command "
    SELECT 'missions', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) FROM chorus_missions t
    UNION ALL SELECT 'entities', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY mission_id,kind,id), '')) FROM chorus_entities t
    UNION ALL SELECT 'events', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) FROM chorus_events t
    UNION ALL SELECT 'live reservations', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY id), '')) FROM chorus_live_reservations t
    UNION ALL SELECT 'migrations', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY version), '')) FROM chorus_migrations t
    UNION ALL SELECT 'rls', count(*), md5(string_agg(relname, '' ORDER BY relname)) FROM pg_class WHERE relname IN ('chorus_missions','chorus_entities','chorus_events','chorus_live_reservations') AND relrowsecurity;"
}
# Stop source web/worker before this check so comparisons address the archive's snapshot.
before=$(fingerprint "$source_database")
docker exec "$container" pg_dump --username "$database_user" --format custom "$source_database" > "$archive"
test -s "$archive"
docker exec "$container" createdb --username "$database_user" "$restore_database"
created=true
docker exec -i "$container" pg_restore --username "$database_user" --dbname "$restore_database" --no-owner --exit-on-error < "$archive"
after=$(fingerprint "$restore_database")
rls_count=$(docker exec "$container" psql --username "$database_user" --dbname "$restore_database" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM pg_class WHERE relname IN ('chorus_missions','chorus_entities','chorus_events','chorus_live_reservations') AND relrowsecurity;")
if [[ "$rls_count" != 4 ]]; then
  echo 'FAIL: restored mission tables must all retain row-level security.' >&2
  exit 1
fi
if [[ "$before" != "$after" ]]; then
  echo 'FAIL: restored mission/event/entity/migration fingerprints or RLS differ.' >&2
  exit 1
fi
echo 'PASS: full database archive restored into a separate database; mission/event/entity/migration contents and RLS match.'

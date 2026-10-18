CREATE UNIQUE INDEX IF NOT EXISTS chorus_execution_identity_idx
ON chorus_entities ((payload->>'executionId'))
WHERE kind='attempt' AND payload->>'mode'='real' AND payload ? 'executionId';

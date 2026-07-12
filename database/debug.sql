BEGIN;

-- select COLUMN_NAME
-- from information_schema.columns
-- where table_name = 'events';

-- SELECT description FROM events;

ALTER TABLE events
ADD description VARCHAR(240);

COMMIT;
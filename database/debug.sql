BEGIN;

select COLUMN_NAME
from information_schema.columns
where table_name = 'events';

SELECT description FROM events;

COMMIT;
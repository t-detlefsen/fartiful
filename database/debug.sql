BEGIN;

-- -- List column names 
-- select COLUMN_NAME
-- from information_schema.columns
-- where table_name = 'media';

-- -- List specified column contents
-- SELECT id FROM media;

-- -- Create media table
-- CREATE TABLE IF NOT EXISTS media (
--     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     event_id     VARCHAR(8) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
--     user_id      VARCHAR(100) NOT NULL,
--     filename     VARCHAR(100) NOT NULL,
--     created_at  TIMESTAMPTZ DEFAULT NOW()
-- );

-- Insert toy value
INSERT INTO media (event_id, filename, user_id)
VALUES ('mYqYVMTe', 'IMG_6642.JPG', 'user_1790591757875_ljt5c2dmy');

-- -- Update Record
-- UPDATE media
-- SET user_id = 'user_1790591757875_ljt5c2dmy'
-- WHERE filename = '1000138143.jpg';

COMMIT;
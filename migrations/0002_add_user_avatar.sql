-- Migration number: 0002 	 2026-11-10T19:14:33.422Z
-- User profile extras (dashboard header widget): Splitwise avatar + first name.
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN first_name TEXT;

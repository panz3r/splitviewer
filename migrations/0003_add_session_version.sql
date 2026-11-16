-- Migration number: 0003 	 2026-11-16T10:00:00.000Z
-- Server-side session revocation: sessions embed this counter (`sv` claim);
-- logout bumps it, invalidating every outstanding session JWT for the user.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

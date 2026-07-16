ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'karyawan';

ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin', 'karyawan'));

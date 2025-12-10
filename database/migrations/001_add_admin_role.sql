-- Migration: Add admin role to users table
-- Created: 2025-01-06

-- Add is_admin column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster admin queries
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Optional: Set a specific user as admin (replace email with your admin email)
-- UPDATE users SET is_admin = true WHERE email = 'admin@example.com';

-- Add comment to column
COMMENT ON COLUMN users.is_admin IS 'Indicates if the user has administrator privileges';

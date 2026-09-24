/*
  # Add Organization ID to Users Table

  1. Purpose
    - Link users (responders/admins) to specific organizations
    - Enable users to only see alerts for their organization

  2. Schema Changes
    - Add `organization_id` column to users table
    - Add foreign key constraint to organizations table

  3. Important Notes
    - Only responders and admins should have organization_id set
    - Citizens remain with NULL organization_id
    - This enables organization-specific filtering for emergency reports
*/

-- Add organization_id to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE users ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
  END IF;
END $$;

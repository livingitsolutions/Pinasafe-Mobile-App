/*
  # Add Team Position and Address Fields

  1. Changes to team_members table
    - Add `position` column to store the member's role/position in the team
    
  2. Changes to users table
    - Add `address` column to store user's physical address
    - Add `barangay` column to store barangay
    - Add `city` column to store city/municipality
    - Add `province` column to store province
    
  3. Changes to personnel table
    - Add `team_id` column to reference the team they belong to
    - Add `team_position` column to store their position in the team

  4. Security
    - No RLS changes needed as existing policies cover new columns
*/

-- Add position to team_members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_members' AND column_name = 'position'
  ) THEN
    ALTER TABLE team_members ADD COLUMN position TEXT DEFAULT 'Member';
  END IF;
END $$;

-- Add address fields to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'address'
  ) THEN
    ALTER TABLE users ADD COLUMN address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'barangay'
  ) THEN
    ALTER TABLE users ADD COLUMN barangay TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'city'
  ) THEN
    ALTER TABLE users ADD COLUMN city TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'province'
  ) THEN
    ALTER TABLE users ADD COLUMN province TEXT;
  END IF;
END $$;

-- Add team reference to personnel table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE personnel ADD COLUMN team_id UUID REFERENCES rescue_teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'team_position'
  ) THEN
    ALTER TABLE personnel ADD COLUMN team_position TEXT;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_personnel_team_id ON personnel(team_id);

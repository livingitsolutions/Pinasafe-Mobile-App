/*
  # Remove Position Column from Personnel Table

  1. Changes
    - Drop `position` column from `personnel` table
    - This field is now replaced by `team_position` which is set when personnel are assigned to teams
    
  2. Notes
    - Position is now team-specific, not personnel-specific
    - Team leaders get `team_position = 'Team Leader'`
    - Team members get `team_position = 'Member'` or custom positions
    - Personnel without team assignments have `team_position = NULL`
*/

-- Drop position column from personnel table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personnel' AND column_name = 'position'
  ) THEN
    ALTER TABLE personnel DROP COLUMN position;
  END IF;
END $$;

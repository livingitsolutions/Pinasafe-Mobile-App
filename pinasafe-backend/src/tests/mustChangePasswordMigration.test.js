const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationsDirectory = path.join(repositoryRoot, 'supabase/migrations');
const migrationFilename = '20260928000100_reconcile_users_must_change_password.sql';
const migrationPath = path.join(migrationsDirectory, migrationFilename);
const migration = fs.readFileSync(migrationPath, 'utf8');
const baseMigration = fs.readFileSync(
  path.join(migrationsDirectory, '20251012073833_create_pinasafe_schema.sql'),
  'utf8'
);
const b4MigrationPath = path.join(
  migrationsDirectory,
  '20260927000100_create_atomic_emergency_report_binding.sql'
);

describe('B6.2 must_change_password migration contract', () => {
  test('is the next chronological migration after B4 and follows the fresh-schema users table', () => {
    const migrationFilenames = fs.readdirSync(migrationsDirectory).sort();
    const b4Filename = path.basename(b4MigrationPath);

    expect(migrationFilenames).toContain(migrationFilename);
    expect(migrationFilenames.indexOf(migrationFilename)).toBeGreaterThan(
      migrationFilenames.indexOf(b4Filename)
    );
    expect(baseMigration).toMatch(/CREATE TABLE IF NOT EXISTS users\s*\(/i);
  });

  test('adds a non-null boolean with the application-compatible false default', () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.users\s+ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;/i
    );
    expect(migration).toMatch(
      /ALTER COLUMN must_change_password SET DEFAULT false;/i
    );
    expect(migration).toMatch(
      /ALTER COLUMN must_change_password SET NOT NULL;/i
    );
  });

  test('backfills only NULL flag values and preserves existing true values', () => {
    expect(migration).toMatch(
      /UPDATE public\.users\s+SET must_change_password = false\s+WHERE must_change_password IS NULL;/i
    );
    expect(migration).not.toMatch(/SET must_change_password\s*=\s*true/i);
  });

  test('changes only users.must_change_password without drops, privilege changes, or other table mutations', () => {
    const alteredTables = [...migration.matchAll(/ALTER TABLE\s+([\w.]+)/gi)]
      .map((match) => match[1].toLowerCase());
    const updatedTables = [...migration.matchAll(/UPDATE\s+([\w.]+)/gi)]
      .map((match) => match[1].toLowerCase());

    expect(alteredTables.length).toBeGreaterThan(0);
    expect(alteredTables.every((table) => table === 'public.users')).toBe(true);
    expect(updatedTables).toEqual(['public.users']);
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
    expect(migration).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|GRANT|REVOKE)\b/i);
    expect(migration).not.toMatch(/\bCREATE\s+(TABLE|POLICY|TRIGGER|FUNCTION)\b/i);
    expect(migration).not.toMatch(/emergency_reports|evidence_upload_sessions|report_evidence/i);
  });
});
-- Wipes row data from every table in `public` while leaving the schema intact.
-- Unlike drop-all.sql this needs no `db push` afterwards: only a reseed.
-- `_prisma_migrations` is skipped so Prisma still considers the DB migrated.
DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename <> '_prisma_migrations';

  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- Rollback for migration 20260928000000_lab4_actions_taken (specification.md 7, labsheet 5.2).
-- Removes only what that migration added. No Lab 1 to 3 table, column or row is touched, so every
-- User, Ticket, Attachment, Public Comment and Internal Note survives. Actions Taken and status
-- history recorded since the migration are lost, which is why a pg_dump is taken first.
--
-- Run it with:  npx prisma db execute --file prisma/rollback/lab4_actions_taken.down.sql
-- then:         DELETE FROM "_prisma_migrations" WHERE migration_name = '20260928000000_lab4_actions_taken';
-- (the second line only on a database managed by prisma migrate, so the migration can be re-applied)

DROP TABLE IF EXISTS "TicketStatusHistory";
DROP TABLE IF EXISTS "ActionTaken";
DROP TYPE IF EXISTS "ActionStatus";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

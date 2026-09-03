-- DropIndex
DROP INDEX "Ticket_requesterId_idx";

-- DropIndex
DROP INDEX "Ticket_ticketDate_idx";

-- AlterTable
ALTER TABLE "RelatedSystem" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Ticket_requesterId_ticketDate_idx" ON "Ticket"("requesterId", "ticketDate");

-- CreateSequence
-- Backs the Ticket Number generator (Issue #13): the backend formats TKT-<year>-<6-digit>
-- from nextval('ticket_number_seq') rather than exposing this as a Prisma-managed column,
-- since Prisma has no first-class support for a standalone sequence (specification.md §11).
CREATE SEQUENCE IF NOT EXISTS "ticket_number_seq" START WITH 1 INCREMENT BY 1;

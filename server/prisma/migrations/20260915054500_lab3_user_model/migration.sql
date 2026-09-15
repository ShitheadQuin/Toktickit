-- Lab 2 → Lab 3: evolve Requester into User without touching any Ticket or Attachment row
-- (specification.md §7, BR-24). Written by hand, because a generated migration drops the
-- Requester table and creates an empty User table, orphaning every Lab 2 Ticket.

-- 1. Roles, and the seven new Ticket statuses (NEW stays first)
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');
ALTER TYPE "CurrentStatus" ADD VALUE 'OPEN';
ALTER TYPE "CurrentStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "CurrentStatus" ADD VALUE 'WAITING_FOR_REQUESTER';
ALTER TYPE "CurrentStatus" ADD VALUE 'RESOLVED';
ALTER TYPE "CurrentStatus" ADD VALUE 'CLOSED';
ALTER TYPE "CurrentStatus" ADD VALUE 'REOPENED';
ALTER TYPE "CurrentStatus" ADD VALUE 'CANCELLED';

-- 2. Requester becomes User. Rows, ids and the Ticket foreign key stay exactly as they are.
ALTER TABLE "Requester" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "Requester_pkey" TO "User_pkey";
ALTER INDEX "Requester_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "Requester_id_seq" RENAME TO "User_id_seq";

-- 3. New User columns: passwordHash goes nullable → backfilled → required.
ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" "Role" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- bcrypt (cost 12) hash of the local-development initial password in prisma/seed-credentials.ts.
-- Not a real credential; every migrated account must change it at first login.
UPDATE "User"
SET "passwordHash" = '$2b$12$BrWogzE9U9hF29g2rI4m9eO7YLKyxjhADmb066kfUUospnCXBQZm.'
WHERE "passwordHash" IS NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- 4. Ticket workflow fields. IT Priority starts as a copy of Requested Priority (labsheet §4.5).
ALTER TABLE "Ticket"
  ADD COLUMN "ticketOwnerId" INTEGER,
  ADD COLUMN "itPriority" "RequestedPriority",
  ADD COLUMN "requesterConfirmedAt" TIMESTAMP(3);
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;

-- 5. New tables
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- 6. Indexes and foreign keys
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Ticket_ticketOwnerId_idx" ON "Ticket"("ticketOwnerId");
CREATE INDEX "Ticket_currentStatus_idx" ON "Ticket"("currentStatus");
CREATE INDEX "PublicComment_ticketId_createdAt_idx" ON "PublicComment"("ticketId", "createdAt");
CREATE INDEX "InternalNote_ticketId_createdAt_idx" ON "InternalNote"("ticketId", "createdAt");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketOwnerId_fkey"
  FOREIGN KEY ("ticketOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

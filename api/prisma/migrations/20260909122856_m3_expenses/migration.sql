-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('equal', 'percent', 'fixed');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('all', 'optional');

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "attendance_mode" "AttendanceMode" NOT NULL DEFAULT 'all';

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "activity_id" TEXT,
    "label" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "paid_by" TEXT NOT NULL,
    "split_mode" "SplitMode" NOT NULL DEFAULT 'equal',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_shares" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "expense_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "from_participant_id" TEXT NOT NULL,
    "to_participant_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_absences" (
    "activity_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_absences_pkey" PRIMARY KEY ("activity_id","participant_id")
);

-- CreateIndex
CREATE INDEX "expenses_event_id_created_at_idx" ON "expenses"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "expense_shares_participant_id_idx" ON "expense_shares"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_shares_expense_id_participant_id_key" ON "expense_shares"("expense_id", "participant_id");

-- CreateIndex
CREATE INDEX "settlements_event_id_idx" ON "settlements"("event_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_participant_id_fkey" FOREIGN KEY ("from_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_participant_id_fkey" FOREIGN KEY ("to_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_absences" ADD CONSTRAINT "activity_absences_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_absences" ADD CONSTRAINT "activity_absences_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Argent en centimes entiers, strictement positif : une dépense de zéro n'est pas une
-- dépense, et un montant négatif serait un remboursement déguisé qui contournerait la
-- table `settlements` (conception §2.8). Prisma ne modélise pas les CHECK : elles vivent
-- ici, et `tests/schema-m3.test.ts` les couvre.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount_cents" > 0);

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_positive" CHECK ("amount_cents" > 0);

-- Un virement vers soi-même ne règle rien et fausserait la minimisation des virements.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_distinct_parties"
  CHECK ("from_participant_id" <> "to_participant_id");

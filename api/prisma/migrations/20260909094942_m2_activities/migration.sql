-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('proposed', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('for', 'against');

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ActivityStatus" NOT NULL DEFAULT 'proposed',
    "proposed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_votes" (
    "activity_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_votes_pkey" PRIMARY KEY ("activity_id","participant_id")
);

-- CreateIndex
CREATE INDEX "activities_event_id_position_idx" ON "activities"("event_id", "position");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_votes" ADD CONSTRAINT "activity_votes_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_votes" ADD CONSTRAINT "activity_votes_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

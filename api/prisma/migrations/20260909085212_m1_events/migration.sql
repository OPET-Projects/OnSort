-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "Rsvp" AS ENUM ('invited', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "InviteScope" AS ENUM ('event', 'group');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'member',
    "rsvp" "Rsvp" NOT NULL DEFAULT 'invited',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_links" (
    "id" TEXT NOT NULL,
    "scope" "InviteScope" NOT NULL,
    "target_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "scope" "InviteScope" NOT NULL,
    "target_id" TEXT NOT NULL,
    "invited_user_id" TEXT,
    "invited_email" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "invited_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_group_id_idx" ON "events"("group_id");

-- CreateIndex
CREATE INDEX "event_participants_user_id_idx" ON "event_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_id_user_id_key" ON "event_participants"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_links_token_hash_key" ON "invite_links"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_invited_user_id_idx" ON "invitations"("invited_user_id");

-- CreateIndex
CREATE INDEX "invitations_invited_email_idx" ON "invitations"("invited_email");

-- Contrainte non modélisable par Prisma : une invitation vise soit un utilisateur connu,
-- soit une adresse e-mail (conception §2.6). La base la garantit en dernière ligne.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_target_identity_check"
    CHECK ("invited_user_id" IS NOT NULL OR "invited_email" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

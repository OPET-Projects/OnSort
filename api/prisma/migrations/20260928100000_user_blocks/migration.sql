-- Blocage d'un utilisateur par un autre (spec « membres et amis »). Le CHECK ne vit qu'ici :
-- Prisma ne modélise pas les contraintes de ce genre.
-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id"),
    CONSTRAINT "user_blocks_distinct" CHECK ("blocker_id" <> "blocked_id")
);

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

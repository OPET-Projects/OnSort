-- Événements de groupe : la colonne `group_id` existe depuis M1, sans clé étrangère faute
-- d'usage. `SET NULL` plutôt que `CASCADE` : un groupe qui disparaît ne doit pas emporter
-- ses sorties, dont les dépenses sont de l'argent réel. L'événement survit en ad hoc.
-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Annulation d'une activité (conception §3.7) : la date est posée, l'activité reste.
--
-- Aucune contrainte n'accompagne la colonne. Une date nulle et une date passée sont toutes
-- deux valides, et interdire une date future n'aurait pas de sens pour une annulation
-- programmée.
-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "cancelled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- Le domaine des coordonnées géographiques. Prisma ne modélise pas les CHECK ;
-- `tests/schema-m5.test.ts` les couvre.
ALTER TABLE "activities" ADD CONSTRAINT "activities_latitude_range"
  CHECK ("lat" IS NULL OR ("lat" >= -90 AND "lat" <= 90));

ALTER TABLE "activities" ADD CONSTRAINT "activities_longitude_range"
  CHECK ("lng" IS NULL OR ("lng" >= -180 AND "lng" <= 180));

-- Une coordonnée à moitié posée ne place rien, et laisserait le front décider quoi en faire.
ALTER TABLE "activities" ADD CONSTRAINT "activities_coordinates_paired"
  CHECK (("lat" IS NULL) = ("lng" IS NULL));

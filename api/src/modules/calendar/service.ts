import { prisma } from '../../db.ts'
import { mergeIntervals } from '../../lib/calendar.ts'
import { ApiError } from '../../lib/http.ts'
import type { AddUnavailabilityInput, WindowInput } from './schema.ts'

// Calendrier personnel (conception §2.4). Ce fichier ne connaît pas Hono : il reçoit
// l'identifiant de l'appelant en argument et lève des `ApiError`.

function assertPeriod(startsAt: Date, endsAt: Date): void {
  // Bornes semi-ouvertes : une plage vide n'occupe rien, une plage inversée n'a pas de sens.
  if (endsAt <= startsAt) {
    throw new ApiError('invalid_period', 400, 'La fin doit suivre le début.', { field: 'endsAt' })
  }
}

// Ajout avec **fusion** des plages qui se touchent ou se recouvrent (§2.4).
//
// La transaction et le verrou de ligne ne sont pas décoratifs : deux ajouts simultanés
// liraient sinon le même état, écriraient deux lignes disjointes, et l'invariant de
// non-superposition tomberait — celui-là même que la contrainte `EXCLUDE` écartée aurait
// garanti (decisions-techniques §2.3).
export async function addUnavailability(userId: string, input: AddUnavailabilityInput) {
  assertPeriod(input.startsAt, input.endsAt)

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM unavailability WHERE user_id = ${userId} FOR UPDATE`

    // `lte` et `gte`, non `lt`/`gt` : on veut aussi attraper les plages **adjacentes**, à
    // fusionner. C'est le seul endroit du jalon où la comparaison n'est pas strictement
    // semi-ouverte, et c'est délibéré.
    const touching = await tx.unavailability.findMany({
      where: { userId, startsAt: { lte: input.endsAt }, endsAt: { gte: input.startsAt } },
      orderBy: { startsAt: 'asc' },
    })

    const merged = mergeIntervals([
      ...touching,
      { startsAt: input.startsAt, endsAt: input.endsAt },
    ])[0]

    if (merged === undefined) {
      throw new ApiError('internal_error', 500, 'Fusion impossible.')
    }

    await tx.unavailability.deleteMany({ where: { id: { in: touching.map((row) => row.id) } } })

    return tx.unavailability.create({
      data: {
        userId,
        startsAt: merged.startsAt,
        endsAt: merged.endsAt,
        // Le libellé saisi l'emporte ; à défaut, le premier libellé absorbé survit. La fusion
        // perd les frontières d'origine, c'est le prix assumé de l'ergonomie retenue.
        label: input.label ?? touching.find((row) => row.label !== null)?.label ?? null,
      },
    })
  })
}

export async function listUnavailability(userId: string, window: WindowInput) {
  // Chevauchement en bornes semi-ouvertes : une plage commencée avant la fenêtre mais qui
  // s'y prolonge doit apparaître.
  const rows = await prisma.unavailability.findMany({
    where: {
      userId,
      ...(window.to === undefined ? {} : { startsAt: { lt: window.to } }),
      ...(window.from === undefined ? {} : { endsAt: { gt: window.from } }),
    },
    orderBy: { startsAt: 'asc' },
  })

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    label: row.label,
  }))
}

// Supprimer la plage d'autrui rend 404 et non 403 : répondre « interdit » confirmerait que
// cette plage existe, et le calendrier de quelqu'un d'autre ne se devine pas.
export async function removeUnavailability(userId: string, id: string) {
  const { count } = await prisma.unavailability.deleteMany({ where: { id, userId } })

  if (count === 0) {
    throw new ApiError('unavailability_not_found', 404, 'Indisponibilité introuvable.')
  }

  return { ok: true }
}

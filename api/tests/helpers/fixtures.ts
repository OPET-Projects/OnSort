import { prisma } from '../../src/db.ts'

// Jeu d'essai partagé par les tests financiers : un événement et N participants ayant
// accepté. Les identifiants d'utilisateur sont **déterministes** (`user-0`, `user-1`, …)
// pour que le départage par identifiant des restes de division — §3.5 — soit reproductible
// d'une exécution à l'autre.

type Options = {
  withActivity?: boolean
}

export async function seedEventWithParticipants(count: number, options: Options = {}) {
  const creatorId = await createUser(0)

  const event = await prisma.event.create({
    data: {
      title: 'Sortie',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T23:00:00Z'),
      createdBy: creatorId,
    },
  })

  const participants = []

  for (let index = 0; index < count; index += 1) {
    const userId = index === 0 ? creatorId : await createUser(index)

    participants.push(
      await prisma.eventParticipant.create({
        data: {
          eventId: event.id,
          userId,
          role: index === 0 ? 'admin' : 'member',
          rsvp: 'accepted',
        },
      }),
    )
  }

  let activityId = ''

  if (options.withActivity === true) {
    const activity = await prisma.activity.create({
      data: { eventId: event.id, title: 'Musée', proposedBy: participants[0].id },
    })
    activityId = activity.id
  }

  return { eventId: event.id, participants, activityId }
}

async function createUser(index: number): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: `user-${index}`,
      name: `Participant ${index}`,
      email: `participant-${index}@example.test`,
      emailVerified: true,
    },
  })

  return user.id
}

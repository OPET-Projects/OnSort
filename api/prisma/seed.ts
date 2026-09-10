import { config } from '../src/config.ts'
import { prisma } from '../src/db.ts'

// Jeu de données de développement. Il ne se contente pas de créer des comptes : une
// démonstration a besoin d'un événement déjà vivant — des votes en cours, des dépenses
// saisies, un solde qui n'est pas nul et un virement en attente de confirmation. Sans quoi
// chaque `npm test`, qui vide la base, impose de tout ressaisir à la main.
//
// Toutes les lignes portent un identifiant préfixé `dev-` : relancer le seed les remplace
// au lieu d'en empiler des copies.

const PEOPLE = [
  { id: 'dev-alice', name: 'Alice Meunier', email: 'alice@example.test' },
  { id: 'dev-bob', name: 'Bob Ragueneau', email: 'bob@example.test' },
  { id: 'dev-carla', name: 'Carla Belhadj', email: 'carla@example.test' },
] as const

const EVENT_ID = 'dev-event-raclette'
const GROUP_ID = 'dev-group-coloc'

// Participations : `dev-part-<prénom>`, pour que les votes, les parts et les virements
// ci-dessous se lisent sans indirection.
const PART = {
  alice: 'dev-part-alice',
  bob: 'dev-part-bob',
  carla: 'dev-part-carla',
} as const

// L'événement est toujours dans le futur, quel que soit le jour où l'on sème : un événement
// passé ferait mentir l'écran d'accueil et viderait la carte des créneaux libres.
function nextWeekday(weekday: number, hour: number, minute = 0): Date {
  const date = new Date()
  const shift = (weekday - date.getDay() + 7) % 7 || 7

  date.setDate(date.getDate() + shift)
  date.setHours(hour, minute, 0, 0)

  return date
}

function sameDayAt(reference: Date, hour: number, minute = 0): Date {
  const date = new Date(reference)
  date.setHours(hour, minute, 0, 0)

  return date
}

const FRIDAY_EVENING = nextWeekday(5, 20)
const FRIDAY_NIGHT = sameDayAt(FRIDAY_EVENING, 23, 30)
const SATURDAY_MORNING = nextWeekday(6, 9)
const SATURDAY_NOON = sameDayAt(SATURDAY_MORNING, 13)
const SUNDAY_START = nextWeekday(0, 8)
const SUNDAY_END = sameDayAt(SUNDAY_START, 18)

// Deux dépenses, parts égales entre les deux personnes ayant accepté. Alice avance
// 48,40 €, Bob 30,00 € : Alice est créancière de 9,20 €, que Bob a déclaré avoir viré sans
// qu'elle l'ait encore confirmé — l'état exact qu'il faut pour montrer les deux boutons.
const CHEESE_CENTS = 4840
const WINE_CENTS = 3000
const SETTLEMENT_CENTS = 920

export async function seed(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Le jeu de données de développement ne doit pas être appliqué en production.')
  }

  // L'événement et le groupe partent en premier : leurs cascades emportent participations,
  // votes, parts et virements, ce qui rend le seed rejouable.
  await prisma.event.deleteMany({ where: { id: EVENT_ID } })
  await prisma.group.deleteMany({ where: { id: GROUP_ID } })
  await prisma.unavailability.deleteMany({ where: { userId: { in: PEOPLE.map((p) => p.id) } } })
  await prisma.friendRequest.deleteMany({ where: { fromUserId: { in: PEOPLE.map((p) => p.id) } } })
  await prisma.friendship.deleteMany({ where: { userAId: { in: PEOPLE.map((p) => p.id) } } })
  await prisma.notification.deleteMany({ where: { userId: { in: PEOPLE.map((p) => p.id) } } })

  for (const person of PEOPLE) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { name: person.name },
      create: { ...person, emailVerified: true },
    })
  }

  await prisma.event.create({
    data: {
      id: EVENT_ID,
      title: 'Raclette chez Alice',
      description: 'Chacun ramène une bouteille, le fromage est prévu.',
      startsAt: FRIDAY_EVENING,
      endsAt: FRIDAY_NIGHT,
      status: 'active',
      createdBy: 'dev-alice',
      participants: {
        create: [
          { id: PART.alice, userId: 'dev-alice', role: 'admin', rsvp: 'accepted' },
          { id: PART.bob, userId: 'dev-bob', rsvp: 'accepted' },
          // Carla n'a pas répondu : c'est elle qui montre l'état « à confirmer », et sa
          // part n'entre dans aucune dépense — les parts sont figées à la saisie.
          { id: PART.carla, userId: 'dev-carla', rsvp: 'invited' },
        ],
      },
    },
  })

  await prisma.activity.createMany({
    data: [
      {
        id: 'dev-activity-comptoir',
        eventId: EVENT_ID,
        title: 'Bar à vins Le Comptoir',
        address: '12 rue Sainte-Anne, 75002 Paris',
        lat: 48.8672,
        lng: 2.3363,
        position: 1,
        status: 'accepted',
        proposedBy: PART.alice,
      },
      {
        id: 'dev-activity-karaoke',
        eventId: EVENT_ID,
        title: 'Karaoké Le Shibuya',
        address: '7 rue Chabanais, 75002 Paris',
        lat: 48.8676,
        lng: 2.3372,
        position: 2,
        status: 'proposed',
        proposedBy: PART.bob,
      },
      // Sans adresse : elle n'apparaît pas sur la carte, ce qui est le comportement à
      // montrer, pas un oubli.
      {
        id: 'dev-activity-expo',
        eventId: EVENT_ID,
        title: 'Expo Vermeer',
        position: 3,
        status: 'proposed',
        proposedBy: PART.alice,
      },
    ],
  })

  await prisma.activityVote.createMany({
    data: [
      { activityId: 'dev-activity-comptoir', participantId: PART.alice, value: 'for' },
      { activityId: 'dev-activity-comptoir', participantId: PART.bob, value: 'for' },
      { activityId: 'dev-activity-karaoke', participantId: PART.bob, value: 'for' },
      { activityId: 'dev-activity-karaoke', participantId: PART.alice, value: 'against' },
    ],
  })

  await prisma.expense.create({
    data: {
      id: 'dev-expense-fromage',
      eventId: EVENT_ID,
      label: 'Fromage et charcuterie',
      amountCents: CHEESE_CENTS,
      paidBy: PART.alice,
      createdBy: PART.alice,
      shares: {
        create: [
          { participantId: PART.alice, amountCents: CHEESE_CENTS / 2 },
          { participantId: PART.bob, amountCents: CHEESE_CENTS / 2 },
        ],
      },
    },
  })

  await prisma.expense.create({
    data: {
      id: 'dev-expense-vin',
      eventId: EVENT_ID,
      label: 'Vin',
      amountCents: WINE_CENTS,
      paidBy: PART.bob,
      createdBy: PART.bob,
      shares: {
        create: [
          { participantId: PART.alice, amountCents: WINE_CENTS / 2 },
          { participantId: PART.bob, amountCents: WINE_CENTS / 2 },
        ],
      },
    },
  })

  // Déclaré, pas confirmé : Bob voit « retirer », Alice voit « j'ai reçu », et le solde ne
  // bouge qu'une fois qu'elle confirme (conception §3.6).
  await prisma.settlement.create({
    data: {
      id: 'dev-settlement-bob-alice',
      eventId: EVENT_ID,
      fromParticipantId: PART.bob,
      toParticipantId: PART.alice,
      amountCents: SETTLEMENT_CENTS,
    },
  })

  await prisma.group.create({
    data: {
      id: GROUP_ID,
      name: 'La coloc',
      createdBy: 'dev-alice',
      members: {
        create: [
          { userId: 'dev-alice', role: 'admin' },
          { userId: 'dev-bob' },
          { userId: 'dev-carla' },
        ],
      },
    },
  })

  // De quoi faire apparaître des créneaux communs sans les faire disparaître : deux
  // occupations sur des jours différents, aucune sur le vendredi soir.
  await prisma.unavailability.createMany({
    data: [
      {
        userId: 'dev-bob',
        startsAt: SATURDAY_MORNING,
        endsAt: SATURDAY_NOON,
        label: 'Cours de rattrapage',
      },
      {
        userId: 'dev-carla',
        startsAt: SUNDAY_START,
        endsAt: SUNDAY_END,
        label: 'Chez ses parents',
      },
    ],
  })

  // Alice et Bob sont amis ; Carla a demandé Alice et attend. Le couple d'une amitié est
  // normalisé — `user_a_id < user_b_id` est une contrainte de la base.
  await prisma.friendship.create({ data: { userAId: 'dev-alice', userBId: 'dev-bob' } })
  await prisma.friendRequest.create({
    data: { id: 'dev-request-carla', fromUserId: 'dev-carla', toUserId: 'dev-alice' },
  })

  await prisma.notification.createMany({
    data: [
      {
        userId: 'dev-alice',
        eventId: EVENT_ID,
        type: 'activity.proposed',
        payload: { title: 'Karaoké Le Shibuya' },
      },
      {
        userId: 'dev-alice',
        eventId: EVENT_ID,
        type: 'settlement.declared',
        payload: { name: 'Bob Ragueneau' },
      },
      { userId: 'dev-alice', type: 'friend.request', payload: { name: 'Carla Belhadj' } },
    ],
  })

  console.info(
    [
      `${PEOPLE.length} comptes de développement : ${PEOPLE.map((p) => p.email).join(', ')}`,
      '  1 événement en cours, 3 activités, 2 dépenses, 1 virement en attente',
      '  1 groupe, 2 indisponibilités, 1 amitié, 1 demande d’ami',
    ].join('\n'),
  )
}

// Exécuté directement par `npm run db:seed`, importé par son test.
if (process.env.NODE_ENV !== 'test') {
  seed()
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}

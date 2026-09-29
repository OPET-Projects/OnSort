import { afterEach, expect, it, vi } from 'vitest'
import { prisma } from '../../src/db.ts'
import { notify } from '../../src/lib/notify.ts'
import { type ServerEvent, subscribe, userRoom } from '../../src/lib/sse.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

async function makeUser(suffix: string) {
  const user = await prisma.user.create({
    data: { id: `u-${suffix}`, name: suffix, email: `${suffix}@example.test` },
  })
  return user.id
}

it('écrit une ligne par destinataire', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')

  await notify({ userIds: [alice, bob], type: 'friend.request', payload: { name: 'Carla' } })

  expect(await prisma.notification.count()).toBe(2)
  const row = await prisma.notification.findFirstOrThrow({ where: { userId: alice } })
  expect(row.type).toBe('friend.request')
  expect(row.payload).toEqual({ name: 'Carla' })
})

it("n'écrit rien et ne diffuse rien sans destinataire", async () => {
  const received: ServerEvent[] = []
  const stop = subscribe(userRoom('personne'), (event) => received.push(event))

  await notify({ userIds: [], type: 'friend.request' })

  stop()

  expect(await prisma.notification.count()).toBe(0)
  expect(received).toEqual([])
})

// Chacun dans son salon : c'est ce qui empêche une notification d'atterrir chez le voisin.
it('diffuse dans le salon de chaque destinataire', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')

  const chezAlice: ServerEvent[] = []
  const chezBob: ServerEvent[] = []
  const stopA = subscribe(userRoom(alice), (event) => chezAlice.push(event))
  const stopB = subscribe(userRoom(bob), (event) => chezBob.push(event))

  await notify({ userIds: [alice], type: 'expense.created' })

  stopA()
  stopB()

  expect(chezAlice).toHaveLength(1)
  expect(chezBob).toEqual([])
})

// Le message ne porte que `{ type, id }` : le client recharge la ressource (§5.2). Le
// contenu voyagerait sinon vers un flux dont on ne revérifie pas les droits à l'émission.
it('ne diffuse que le type et l’identifiant', async () => {
  const alice = await makeUser('alice')
  const received: ServerEvent[] = []
  const stop = subscribe(userRoom(alice), (event) => received.push(event))

  await notify({ userIds: [alice], type: 'friend.accepted', payload: { name: 'Bob' } })

  stop()

  expect(Object.keys(received[0] ?? {}).sort()).toEqual(['id', 'type'])
  expect(received[0]?.type).toBe('notification.created')
})

it('rattache la notification à son événement quand il y en a un', async () => {
  const alice = await makeUser('alice')

  await notify({ userIds: [alice], type: 'activity.proposed', eventId: 'e1' })

  const row = await prisma.notification.findFirstOrThrow()
  expect(row.eventId).toBe('e1')
})

// Saisir une dépense ne doit pas être perdu parce qu'une notification n'a pas pu s'écrire.
it("ne lève pas quand l'écriture échoue", async () => {
  vi.spyOn(prisma.notification, 'createManyAndReturn').mockRejectedValue(new Error('base morte'))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await expect(notify({ userIds: ['inexistant'], type: 'friend.request' })).resolves.toBeUndefined()
  expect(warn).toHaveBeenCalled()
})

// Les doublons viennent naturellement d'une liste de bénéficiaires : personne ne doit
// recevoir deux fois la même notification.
it('ne notifie qu’une fois un destinataire répété', async () => {
  const alice = await makeUser('alice')

  await notify({ userIds: [alice, alice], type: 'expense.created' })

  expect(await prisma.notification.count()).toBe(1)
})

// Rétention : une notification lue depuis plus de trente jours disparaît au passage, quand
// une nouvelle est écrite pour la même personne. Les non-lues restent, quel que soit leur âge.
const DAY = 86_400_000

async function seedNotification(userId: string, readDaysAgo: number | null, ageDays = 60) {
  return prisma.notification.create({
    data: {
      userId,
      type: 'friend.request',
      createdAt: new Date(Date.now() - ageDays * DAY),
      readAt: readDaysAgo === null ? null : new Date(Date.now() - readDaysAgo * DAY),
    },
  })
}

it('efface les notifications lues depuis plus de trente jours', async () => {
  const alice = await makeUser('alice')
  const old = await seedNotification(alice, 31)

  await notify({ userIds: [alice], type: 'friend.accepted' })

  expect(await prisma.notification.findUnique({ where: { id: old.id } })).toBeNull()
})

it('garde celles lues plus récemment', async () => {
  const alice = await makeUser('alice')
  const recent = await seedNotification(alice, 29)

  await notify({ userIds: [alice], type: 'friend.accepted' })

  expect(await prisma.notification.findUnique({ where: { id: recent.id } })).not.toBeNull()
})

it('garde les non-lues, même anciennes', async () => {
  const alice = await makeUser('alice')
  const unread = await seedNotification(alice, null, 400)

  await notify({ userIds: [alice], type: 'friend.accepted' })

  expect(await prisma.notification.findUnique({ where: { id: unread.id } })).not.toBeNull()
})

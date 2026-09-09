import { expect, it } from 'vitest'
import { prisma } from '../src/db.ts'

async function makeUser(suffix: string) {
  return prisma.user.create({
    data: { id: `u-${suffix}`, name: suffix, email: `${suffix}@example.test` },
  })
}

it('enregistre une demande d’ami en attente', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')

  const request = await prisma.friendRequest.create({
    data: { fromUserId: alice.id, toUserId: bob.id },
  })

  expect(request.status).toBe('pending')
})

it('interdit la demande en double', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  await prisma.friendRequest.create({ data: { fromUserId: alice.id, toUserId: bob.id } })

  await expect(
    prisma.friendRequest.create({ data: { fromUserId: alice.id, toUserId: bob.id } }),
  ).rejects.toThrow()
})

// La demande inverse reste possible : c'est elle qui vaudra acceptation.
it('laisse passer la demande dans l’autre sens', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  await prisma.friendRequest.create({ data: { fromUserId: alice.id, toUserId: bob.id } })

  const reverse = await prisma.friendRequest.create({
    data: { fromUserId: bob.id, toUserId: alice.id },
  })

  expect(reverse.status).toBe('pending')
})

it('refuse une demande à soi-même', async () => {
  const alice = await makeUser('alice')

  await expect(
    prisma.friendRequest.create({ data: { fromUserId: alice.id, toUserId: alice.id } }),
  ).rejects.toThrow()
})

// `user_a_id < user_b_id` normalise le couple : une amitié occupe une seule ligne, et
// « sommes-nous amis » est une lecture directe, sans disjonction (§2.2).
it('enregistre une amitié normalisée', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const [first, second] = [alice.id, bob.id].sort()

  const friendship = await prisma.friendship.create({
    data: { userAId: first as string, userBId: second as string },
  })

  expect(friendship.userAId < friendship.userBId).toBe(true)
})

it('refuse un couple non normalisé', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const [first, second] = [alice.id, bob.id].sort()

  await expect(
    prisma.friendship.create({ data: { userAId: second as string, userBId: first as string } }),
  ).rejects.toThrow()
})

// Régression. La base est en `en_US.utf8`, dont l'ordre est linguistique : `'Z' < 'a'` y
// vaut **faux**, quand le même test en JavaScript vaut **vrai**. Sans `COLLATE "C"` sur la
// contrainte, un couple normalisé côté application était rejeté par la base une fois sur
// deux, selon la casse des identifiants tirés au hasard.
it('accepte un couple que seule la collation C ordonne', async () => {
  const upper = await prisma.user.create({
    data: { id: 'Zed', name: 'Zed', email: 'zed@example.test' },
  })
  const lower = await prisma.user.create({
    data: { id: 'aline', name: 'Aline', email: 'aline@example.test' },
  })

  // 'Zed' < 'aline' en octets, l'inverse en ordre linguistique.
  const friendship = await prisma.friendship.create({
    data: { userAId: upper.id, userBId: lower.id },
  })

  expect(friendship.userAId).toBe('Zed')
})

it('refuse une amitié avec soi-même', async () => {
  const alice = await makeUser('alice')

  await expect(
    prisma.friendship.create({ data: { userAId: alice.id, userBId: alice.id } }),
  ).rejects.toThrow()
})

it('crée une notification non lue', async () => {
  const alice = await makeUser('alice')

  const notification = await prisma.notification.create({
    data: { userId: alice.id, type: 'friend.request', payload: { name: 'Bob' } },
  })

  expect(notification.readAt).toBeNull()
  expect(notification.payload).toEqual({ name: 'Bob' })
})

it('accepte une notification sans charge utile', async () => {
  const alice = await makeUser('alice')

  const notification = await prisma.notification.create({
    data: { userId: alice.id, type: 'event.invited' },
  })

  expect(notification.payload).toEqual({})
})

// Une notification sans destinataire n'a plus de sens, et son flux personnel n'existe plus.
it('supprime les notifications avec leur destinataire', async () => {
  const alice = await makeUser('alice')
  await prisma.notification.create({ data: { userId: alice.id, type: 'friend.request' } })

  await prisma.user.delete({ where: { id: alice.id } })

  expect(await prisma.notification.count()).toBe(0)
})

it('supprime les amitiés avec leur membre', async () => {
  const alice = await makeUser('alice')
  const bob = await makeUser('bob')
  const [first, second] = [alice.id, bob.id].sort()
  await prisma.friendship.create({
    data: { userAId: first as string, userBId: second as string },
  })

  await prisma.user.delete({ where: { id: alice.id } })

  expect(await prisma.friendship.count()).toBe(0)
})

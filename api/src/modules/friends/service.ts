import { config } from '../../config.ts'
import { prisma } from '../../db.ts'
import { normalisePair } from '../../lib/friendship.ts'
import { ApiError } from '../../lib/http.ts'
import { mailer } from '../../lib/mailer.ts'
import { notify } from '../../lib/notify.ts'
import type { FriendRequestInput } from './schema.ts'

// Amis et demandes d'amitié (conception §2.2, §4). Ce fichier ne connaît pas Hono : il
// reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

// **Anti-énumération** (§4) : quelle que soit l'issue — demande créée, demande déjà en
// attente, adresse sans compte — la réponse est exactement celle-ci. L'appelant ne peut pas
// distinguer les trois.
const SAME_ANSWER = { status: 'sent' as const }

// Passe une demande à `accepted` **et** scelle l'amitié, dans une seule transaction.
//
// Les deux écritures forment un tout : une demande acceptée sans amitié laisse deux personnes
// persuadées d'être amies alors qu'aucune ligne ne le dit, et rien dans l'interface ne
// permet de s'en sortir — la demande n'apparaît plus, donc elle ne peut plus être acceptée.
//
// L'`upsert` reste idempotent : deux acceptations concurrentes ne doivent pas heurter la
// clé primaire du couple.
async function acceptAndSeal(requestId: string, firstUserId: string, secondUserId: string) {
  const pair = normalisePair(firstUserId, secondUserId)

  await prisma.$transaction([
    prisma.friendRequest.update({ where: { id: requestId }, data: { status: 'accepted' } }),
    prisma.friendship.upsert({ where: { userAId_userBId: pair }, create: pair, update: {} }),
  ])
}

export async function requestFriendship(userId: string, input: FriendRequestInput) {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (me.email === input.email) {
    // Seule exception à la réponse unique : l'appelant connaît déjà sa propre adresse, lui
    // répondre n'apprend rien à personne.
    throw new ApiError('self_friend_request', 400, 'On ne se demande pas soi-même en ami.')
  }

  // Correspondance stricte sur l'adresse, jamais partielle (§4).
  const target = await prisma.user.findUnique({ where: { email: input.email } })

  if (target === null) {
    // Une adresse inconnue reçoit un courriel d'invitation. C'est ce qui rend les deux cas
    // indistinguables de l'extérieur : dans les deux, quelque chose part.
    await mailer
      .send({
        to: input.email,
        subject: `${me.name} vous invite à le rejoindre sur On Sort ?`,
        text: [
          'Bonjour,',
          '',
          `${me.name} aimerait vous compter parmi ses amis sur On Sort ?, l'application qui`,
          'organise les sorties de groupe. Créez votre compte ici :',
          config.appUrl,
          '',
          "Si vous n'attendiez pas ce message, ignorez-le.",
        ].join('\n'),
      })
      .catch((error: unknown) => {
        console.error(`Invitation d'ami à ${input.email} non envoyée :`, error)
      })

    return SAME_ANSWER
  }

  const pair = normalisePair(userId, target.id)
  const existing = await prisma.friendship.findUnique({ where: { userAId_userBId: pair } })

  if (existing !== null) {
    return SAME_ANSWER
  }

  // **Une demande croisée vaut acceptation.** Si l'autre nous a déjà demandé, refuser pour
  // cause de doublon serait absurde : les deux veulent la même chose.
  const incoming = await prisma.friendRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: target.id, toUserId: userId } },
  })

  if (incoming !== null && incoming.status === 'pending') {
    await acceptAndSeal(incoming.id, userId, target.id)
    await notify({ userIds: [target.id], type: 'friend.accepted', payload: { name: me.name } })

    return SAME_ANSWER
  }

  const outgoing = await prisma.friendRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: target.id } },
  })

  // Déjà en attente : ne rien réécrire et surtout **ne pas renotifier**. Sans cette garde,
  // recliquer relancerait le destinataire autant de fois qu'on insiste.
  if (outgoing?.status === 'pending') {
    return SAME_ANSWER
  }

  // Une demande refusée puis renouvelée doit pouvoir aboutir : aucun état n'est absorbant.
  await prisma.friendRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: target.id } },
    create: { fromUserId: userId, toUserId: target.id },
    update: { status: 'pending' },
  })

  await notify({ userIds: [target.id], type: 'friend.request', payload: { name: me.name } })

  return SAME_ANSWER
}

// Charge une demande **adressée à l'appelant**, ou lève 404. Jamais 403 : répondre
// « interdit » confirmerait que cette demande existe.
async function loadIncomingRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findFirst({
    where: { id: requestId, toUserId: userId },
  })

  if (request === null) {
    throw new ApiError('friend_request_not_found', 404, 'Demande introuvable.')
  }

  return request
}

export async function acceptFriendRequest(userId: string, requestId: string) {
  const request = await loadIncomingRequest(userId, requestId)

  await acceptAndSeal(request.id, userId, request.fromUserId)

  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  await notify({
    userIds: [request.fromUserId],
    type: 'friend.accepted',
    payload: { name: me.name },
  })

  return { ok: true }
}

// Refuser laisse une trace sans créer d'amitié, et n'avertit pas le demandeur : lui dire
// qu'on l'a éconduit n'apporte rien à personne.
export async function declineFriendRequest(userId: string, requestId: string) {
  const request = await loadIncomingRequest(userId, requestId)

  await prisma.friendRequest.update({ where: { id: request.id }, data: { status: 'declined' } })

  return { ok: true }
}

export async function listFriends(userId: string) {
  const [friendships, received, sent] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendRequest.findMany({
      where: { toUserId: userId, status: 'pending' },
      include: { fromUser: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendRequest.findMany({
      where: { fromUserId: userId, status: 'pending' },
      include: { toUser: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    friends: friendships.map((friendship) => {
      const friend = friendship.userAId === userId ? friendship.userB : friendship.userA

      // Le nom, jamais l'adresse : être ami ne donne pas accès au courrier de l'autre.
      return { userId: friend.id, name: friend.name, since: friendship.createdAt }
    }),
    received: received.map((request) => ({
      id: request.id,
      from: { userId: request.fromUserId, name: request.fromUser.name },
      createdAt: request.createdAt,
    })),
    sent: sent.map((request) => ({
      id: request.id,
      to: { userId: request.toUserId, name: request.toUser.name },
      createdAt: request.createdAt,
    })),
  }
}

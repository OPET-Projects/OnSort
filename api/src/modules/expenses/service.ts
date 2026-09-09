import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { computeBalances, minimizeTransfers, splitEqually } from '../../lib/money.ts'
import {
  canConfirmSettlement,
  canDeclareSettlement,
  canManageEvent,
  canRecordExpense,
} from '../../lib/permissions.ts'
import { publish } from '../../lib/sse.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateExpenseInput, DeclareSettlementInput, UpdateExpenseInput } from './schema.ts'

// Règles métier des dépenses (conception §2.8, §3.5, §3.8). Ce fichier ne connaît pas Hono :
// il reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

// Charge la participation de l'appelant et exige qu'il ait accepté l'événement. Un invité
// qui n'a pas répondu reçoit un code distinct du non-participant : l'interface peut alors
// lui proposer d'accepter.
async function loadRecordingParticipant(userId: string, eventId: string) {
  const participant = await loadParticipant(userId, eventId)

  if (!canRecordExpense(participant.rsvp)) {
    throw new ApiError(
      'must_accept_first',
      403,
      "Acceptez d'abord l'événement pour y saisir une dépense.",
    )
  }

  return participant
}

// Bénéficiaires par défaut : les participants ayant accepté (§3.4). Cette liste
// **pré-remplit** le partage sans le piloter — l'appelant peut la restreindre, et
// `expense_shares` fige ensuite le résultat.
async function resolveBeneficiaries(eventId: string, requested: string[] | undefined) {
  const accepted = await prisma.eventParticipant.findMany({
    where: { eventId, rsvp: 'accepted' },
    select: { id: true },
  })

  if (requested === undefined) {
    if (accepted.length === 0) {
      throw new ApiError('no_beneficiary', 409, "Aucun participant n'a accepté l'événement.")
    }

    return accepted.map((participant) => participant.id)
  }

  const known = new Set(accepted.map((participant) => participant.id))
  const unknown = requested.filter((id) => !known.has(id))

  if (unknown.length > 0) {
    throw new ApiError(
      'unknown_beneficiary',
      400,
      "Un bénéficiaire ne participe pas à cet événement, ou n'a pas accepté.",
      { participantIds: unknown },
    )
  }

  return requested
}

export async function createExpense(userId: string, eventId: string, input: CreateExpenseInput) {
  const participant = await loadRecordingParticipant(userId, eventId)
  const beneficiaries = await resolveBeneficiaries(eventId, input.beneficiaryIds)

  // Les trois modes partagent le même stockage (§2.8 note 3) ; seul `equal` sait calculer en
  // M3, l'interface des deux autres arrive en M7.
  const shares = splitEqually(input.amountCents, beneficiaries)

  const expense = await prisma.expense.create({
    data: {
      eventId,
      activityId: input.activityId ?? null,
      label: input.label,
      amountCents: input.amountCents,
      paidBy: participant.id,
      splitMode: input.splitMode,
      createdBy: participant.id,
      shares: { create: shares },
    },
    include: { shares: true },
  })

  publish(eventId, { type: 'expense.created', id: expense.id })

  return expense
}

// Consulter les dépenses est ouvert à **tout** participant, y compris celui qui n'a pas
// encore répondu : savoir ce que la sortie coûte aide à décider si l'on vient.
export async function listExpenses(userId: string, eventId: string) {
  await loadParticipant(userId, eventId)

  const expenses = await prisma.expense.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    include: {
      shares: true,
      payer: { include: { user: true } },
    },
  })

  return expenses.map((expense) => ({
    id: expense.id,
    label: expense.label,
    amountCents: expense.amountCents,
    currency: expense.currency,
    activityId: expense.activityId,
    splitMode: expense.splitMode,
    createdAt: expense.createdAt,
    paidBy: { participantId: expense.paidBy, name: expense.payer.user.name },
    shares: expense.shares.map((share) => ({
      participantId: share.participantId,
      amountCents: share.amountCents,
    })),
  }))
}

export async function loadExpense(expenseId: string) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } })

  if (expense === null) {
    throw new ApiError('expense_not_found', 404, 'Dépense introuvable.')
  }

  return expense
}

export async function updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput) {
  const expense = await loadExpense(expenseId)
  const participant = await loadParticipant(userId, expense.eventId)

  // §3.8 dit qui *saisit* une dépense, pas qui la corrige. Aligné sur le précédent des
  // activités en M2 : l'auteur, et un administrateur — pour qu'une faute de frappe se
  // répare sans mobiliser personne, et que celle de quelqu'un qui a quitté la conversation
  // reste réparable.
  const isAuthor = expense.createdBy === participant.id

  if (!isAuthor && !canManageEvent(participant.role)) {
    throw new ApiError(
      'forbidden',
      403,
      "Seuls l'auteur de la dépense et un administrateur peuvent la modifier.",
    )
  }

  const amountCents = input.amountCents ?? expense.amountCents
  const beneficiaries =
    input.beneficiaryIds === undefined
      ? (
          await prisma.expenseShare.findMany({
            where: { expenseId },
            select: { participantId: true },
          })
        ).map((share) => share.participantId)
      : await resolveBeneficiaries(expense.eventId, input.beneficiaryIds)

  // §2.8 note 2 fige les parts contre les changements de **présence** — pas contre la
  // correction de la dépense elle-même. Laisser les anciennes parts sur un nouveau montant
  // casserait l'invariant `SUM(parts) = montant`, donc on les réécrit.
  const shares = splitEqually(amountCents, beneficiaries)

  // Suppression et réécriture dans la même transaction : sans elle, un incident entre les
  // deux laisserait une dépense sans aucune part, donc un solde faux.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.expenseShare.deleteMany({ where: { expenseId } })

    return tx.expense.update({
      where: { id: expenseId },
      data: {
        label: input.label,
        amountCents,
        activityId: input.activityId,
        shares: { create: shares },
      },
      include: { shares: true },
    })
  })

  publish(expense.eventId, { type: 'expense.updated', id: expenseId })

  return updated
}

// **Aucun solde n'est stocké** (§2.8 note 1) : tout est recalculé à chaque lecture depuis
// `expense_shares` et `settlements`. C'est une poignée de lignes par événement, sur des
// volumes de sortie entre amis ; aucun cache n'est justifié avant d'avoir mesuré.
export async function getBalances(userId: string, eventId: string) {
  const viewer = await loadParticipant(userId, eventId)

  const [participants, expenses, settlements] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { eventId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.expense.findMany({ where: { eventId }, include: { shares: true } }),
    prisma.settlement.findMany({ where: { eventId }, orderBy: { declaredAt: 'asc' } }),
  ])

  // Seuls les règlements **confirmés** entrent dans le solde. Compter une déclaration
  // donnerait au débiteur le pouvoir d'effacer sa dette seul — exactement ce que les deux
  // états de §3.6 existent pour empêcher.
  const confirmed = settlements.filter((settlement) => settlement.confirmedAt !== null)

  const raw = computeBalances({
    participantIds: participants.map((participant) => participant.id),
    expenses: expenses.map((expense) => ({
      paidBy: expense.paidBy,
      amountCents: expense.amountCents,
      shares: expense.shares.map((share) => ({
        participantId: share.participantId,
        amountCents: share.amountCents,
      })),
    })),
    settlements: confirmed,
  })

  // Un solde peut viser quelqu'un qui a quitté l'événement : sa part reste due, mais son
  // nom n'est plus dans la liste des participants.
  const nameOf = new Map(participants.map((participant) => [participant.id, participant.user.name]))
  const nameOrGone = (participantId: string) => nameOf.get(participantId) ?? 'Participant retiré'

  return {
    balances: raw.map((balance) => ({
      participantId: balance.participantId,
      name: nameOrGone(balance.participantId),
      balanceCents: balance.balanceCents,
      you: balance.participantId === viewer.id,
    })),
    transfers: minimizeTransfers(raw).map((transfer) => ({
      ...transfer,
      fromName: nameOrGone(transfer.fromParticipantId),
      toName: nameOrGone(transfer.toParticipantId),
    })),
    // Les déclarations en attente ne bougent aucun solde, mais l'écran doit les montrer :
    // sans elles, le débiteur qui vient de déclarer verrait sa dette intacte et croirait
    // que son geste n'a pas été enregistré.
    pendingSettlements: settlements
      .filter((settlement) => settlement.confirmedAt === null)
      .map((settlement) => ({
        id: settlement.id,
        fromParticipantId: settlement.fromParticipantId,
        toParticipantId: settlement.toParticipantId,
        fromName: nameOrGone(settlement.fromParticipantId),
        toName: nameOrGone(settlement.toParticipantId),
        amountCents: settlement.amountCents,
        declaredAt: settlement.declaredAt,
      })),
  }
}

// Un règlement est une **ligne indépendante** (§2.8 note 1) : il ne modifie aucune dépense
// et garde sa valeur si une dépense antérieure change — le delta réapparaît alors dans le
// solde. Deux états successifs, jamais un seul : le débiteur déclare, le créancier confirme
// (§3.6).
export async function declareSettlement(
  userId: string,
  eventId: string,
  input: DeclareSettlementInput,
) {
  const participant = await loadRecordingParticipant(userId, eventId)

  // Le débiteur est **toujours** l'appelant : on ne déclare pas un paiement au nom d'un
  // autre (§3.8). Aucun champ du corps ne peut le désigner.
  if (input.toParticipantId === participant.id) {
    throw new ApiError('self_settlement', 400, 'Un virement vers soi-même ne règle rien.')
  }

  const creditor = await prisma.eventParticipant.findFirst({
    where: { id: input.toParticipantId, eventId },
    select: { id: true },
  })

  if (creditor === null) {
    throw new ApiError('unknown_creditor', 400, 'Ce bénéficiaire ne participe pas à cet événement.')
  }

  const settlement = await prisma.settlement.create({
    data: {
      eventId,
      fromParticipantId: participant.id,
      toParticipantId: creditor.id,
      amountCents: input.amountCents,
    },
  })

  publish(eventId, { type: 'settlement.declared', id: settlement.id })

  return settlement
}

async function loadSettlement(settlementId: string) {
  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } })

  if (settlement === null) {
    throw new ApiError('settlement_not_found', 404, 'Règlement introuvable.')
  }

  return settlement
}

export async function confirmSettlement(userId: string, settlementId: string) {
  const settlement = await loadSettlement(settlementId)
  const participant = await loadParticipant(userId, settlement.eventId)

  if (!canConfirmSettlement(participant.id, settlement.toParticipantId)) {
    throw new ApiError(
      'forbidden',
      403,
      'Seul le bénéficiaire peut confirmer avoir reçu ce virement.',
    )
  }

  // Confirmer deux fois n'est pas une erreur : l'appel est idempotent et la première date
  // fait foi. Deux clics sur un réseau lent ne doivent pas produire un 409 incompréhensible.
  if (settlement.confirmedAt !== null) {
    return settlement
  }

  const confirmed = await prisma.settlement.update({
    where: { id: settlementId },
    data: { confirmedAt: new Date() },
  })

  publish(settlement.eventId, { type: 'settlement.confirmed', id: settlementId })

  return confirmed
}

// Retrait d'une déclaration erronée — mauvais destinataire, mauvais montant. Sans lui, la
// ligne resterait éternellement en attente et le créancier ne pourrait ni la confirmer ni
// la refuser : un état bloqué, qu'aucune machine à états de cette application n'a le droit
// de produire. Après confirmation, la ligne est définitive : un règlement est un fait, et
// se corrige par un virement inverse.
export async function withdrawSettlement(userId: string, settlementId: string) {
  const settlement = await loadSettlement(settlementId)
  const participant = await loadParticipant(userId, settlement.eventId)

  if (!canDeclareSettlement(participant.id, settlement.fromParticipantId)) {
    throw new ApiError('forbidden', 403, "Seul l'émetteur peut retirer sa déclaration.")
  }

  if (settlement.confirmedAt !== null) {
    throw new ApiError(
      'settlement_already_confirmed',
      409,
      'Ce virement a été confirmé : corrigez-le par un virement inverse.',
    )
  }

  await prisma.settlement.delete({ where: { id: settlementId } })

  publish(settlement.eventId, { type: 'settlement.declared', id: settlementId })

  return { ok: true }
}

export { loadRecordingParticipant, resolveBeneficiaries }

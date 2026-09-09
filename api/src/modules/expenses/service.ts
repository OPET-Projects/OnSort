import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { splitEqually } from '../../lib/money.ts'
import { canManageEvent, canRecordExpense } from '../../lib/permissions.ts'
import { publish } from '../../lib/sse.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateExpenseInput, UpdateExpenseInput } from './schema.ts'

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

export { loadRecordingParticipant, resolveBeneficiaries }

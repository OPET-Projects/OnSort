import { ApiError } from './http.ts'

// Plafond des invitations qui envoient un courriel vers une adresse choisie par l'appelant —
// sortie, groupe, ami inconnu. Sans lui, un seul compte ferait de l'application un relais de
// spam sous notre domaine : quota Resend épuisé, puis domaine classé indésirable, et les
// liens de connexion avec.
//
// Un budget unique pour les trois routes : séparés, on le contournerait en alternant.
//
// En mémoire, comme le bus SSE : un seul processus applicatif est supposé (conception §5.2).
// Un redémarrage remet les compteurs à zéro, ce qui est acceptable pour une protection
// contre l'abus, pas pour une facturation.

export const INVITATION_QUOTA = 20
const WINDOW_MS = 3_600_000

const sentAt = new Map<string, number[]>()

// À appeler **après** le contrôle d'autorisation — un appel refusé ne consomme rien — et
// **avant** la recherche de l'adresse : chaque tentative compte, que l'adresse ait un compte
// ou non, sans quoi le plafond deviendrait un oracle d'énumération (§4).
export function consumeInvitationQuota(userId: string, now = Date.now()): void {
  const recent = (sentAt.get(userId) ?? []).filter((at) => at > now - WINDOW_MS)

  if (recent.length >= INVITATION_QUOTA) {
    const oldest = recent[0] ?? now
    throw new ApiError(
      'too_many_invitations',
      429,
      'Trop d’invitations envoyées en une heure. Réessayez un peu plus tard.',
      { retryAfterSeconds: Math.ceil((oldest + WINDOW_MS - now) / 1000) },
    )
  }

  recent.push(now)
  sentAt.set(userId, recent)
}

export function resetInvitationQuotas(): void {
  sentAt.clear()
}

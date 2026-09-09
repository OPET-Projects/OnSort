import { createHash, randomBytes } from 'node:crypto'

// Jeton d'un lien d'invitation partageable. La base n'en garde que le hachage
// (conception §2.6, `token_hash`) : une lecture de la table `invite_links` ne doit livrer
// aucun lien utilisable.

// 32 octets d'aléa, encodés base64url — sans `+`, `/` ni `=`, donc posables tels quels
// dans une URL.
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

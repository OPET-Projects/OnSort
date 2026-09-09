const MAX_LENGTH = 80

// Nom affichable par défaut, dérivé de l'adresse. L'authentification se fait par lien
// magique seul : il n'existe aucun formulaire d'inscription où saisir un nom, et un compte
// sans nom apparaîtrait comme une ligne vide dans la liste des participants d'un événement.
// C'est une poignée d'affichage, pas une identité déclarée.
export function displayNameFromEmail(email: string): string {
  // L'étiquette d'adresse (`jean.dupont+onsort@…`) désigne un usage, pas une personne.
  const localPart = (email.split('@')[0] ?? '').split('+')[0] ?? ''

  const words = localPart
    .split(/[._-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))

  // Une partie locale qui ne donne aucun mot — que des séparateurs, ou vide — laisse
  // l'adresse entière : elle est laide, mais elle désigne quelqu'un.
  const name = words.length > 0 ? words.join(' ') : email

  return name.slice(0, MAX_LENGTH)
}

// Copie dans le presse-papiers, avec un repli.
//
// `navigator.clipboard` n'existe que dans un contexte sécurisé — HTTPS ou `localhost` — et
// lève quand la permission est refusée. Le lien d'invitation étant précisément ce qu'on
// vient de faire générer, un échec silencieux laisserait l'organisateur coller autre chose
// sans le savoir. On retombe donc sur `document.execCommand('copy')`, dépréciée mais encore
// universelle, et on rend un booléen que l'appelant traduit à l'écran.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission refusée ou contexte non sécurisé : on tente le repli plutôt que d'abandonner.
  }

  return copyByExecCommand(text)
}

function copyByExecCommand(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  // Hors du flux et hors de l'écran : la sélection ne doit ni faire sauter la page ni
  // clignoter sous les yeux de l'utilisateur.
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.top = '-1000px'
  document.body.appendChild(field)

  try {
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

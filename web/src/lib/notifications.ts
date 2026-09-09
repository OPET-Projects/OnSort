import type { Notification } from '../stores/notifications'

// Une notification qu'on ne sait pas rendre reste une notification : un type inconnu produit
// une ligne neutre plutôt qu'un vide. Sans cela, un type ajouté côté API ferait apparaître
// des entrées blanches dans la liste, et la pastille compterait des lignes invisibles.
const FALLBACK = 'Il y a du nouveau.'

const text = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key]
  return typeof value === 'string' ? value : ''
}

export function describeNotification(notification: Notification): string {
  const { payload } = notification
  const name = text(payload, 'name')
  const title = text(payload, 'title')

  switch (notification.type) {
    case 'friend.request':
      return name === '' ? 'Une demande d’ami vous attend.' : `${name} veut vous ajouter en ami.`
    case 'friend.accepted':
      return name === ''
        ? 'Votre demande d’ami a été acceptée.'
        : `${name} a accepté votre demande d’ami.`
    case 'event.invited':
      return title === '' ? 'Vous êtes invité à un événement.' : `Vous êtes invité à « ${title} ».`
    case 'group.invited':
      return text(payload, 'name') === ''
        ? 'Vous êtes invité dans un groupe.'
        : `Vous êtes invité dans le groupe « ${name} ».`
    case 'activity.proposed':
      return title === '' ? 'Une activité attend votre vote.' : `« ${title} » attend votre vote.`
    case 'activity.decided':
      return title === '' ? 'Une activité a été tranchée.' : `« ${title} » a été tranchée.`
    case 'expense.created':
      return text(payload, 'label') === ''
        ? 'Une dépense a été saisie.'
        : `Dépense saisie : ${text(payload, 'label')}.`
    case 'settlement.declared':
      return 'Un virement vous a été déclaré. Confirmez-le une fois reçu.'
    case 'settlement.confirmed':
      return 'Votre virement a été confirmé reçu.'
    default:
      return FALLBACK
  }
}

// Cible d'un clic sur la notification. Rien à ouvrir n'est pas une erreur : une demande
// d'ami mène aux amis, une notification de groupe n'a pas d'écran dédié depuis la liste.
export function notificationLink(notification: Notification): string | null {
  if (notification.eventId !== null) {
    return `/events/${notification.eventId}`
  }

  if (notification.type.startsWith('friend.')) {
    return '/friends'
  }

  return null
}

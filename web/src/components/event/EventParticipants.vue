<script setup lang="ts">
import { ref } from 'vue'
import type { EventDetail, EventPatch } from '../../composables/useEvent'
import { copyToClipboard } from '../../lib/clipboard'
import { rsvpLabel, rsvpTone } from '../../lib/event-labels'

type Rsvp = 'accepted' | 'invited' | 'declined'

const props = defineProps<{
  event: EventDetail
  isAdmin: boolean
  setRsvp: (rsvp: Rsvp) => Promise<void>
  patch: (changes: EventPatch) => Promise<void>
  createInviteLink: () => Promise<string>
  inviteByEmail: (email: string) => Promise<void>
}>()

const rsvpBusy = ref(false)
async function reply(value: Rsvp): Promise<void> {
  rsvpBusy.value = true
  try {
    await props.setRsvp(value)
  } finally {
    rsvpBusy.value = false
  }
}

const statusDraft = ref('')
async function changeStatus(): Promise<void> {
  if (statusDraft.value === '') return
  await props.patch({ status: statusDraft.value as 'draft' | 'active' | 'closed' })
  statusDraft.value = ''
}

const inviteUrl = ref('')
async function generateLink(): Promise<void> {
  inviteUrl.value = await props.createInviteLink()
}

// Le bandeau de confirmation vit dans la vue : il doit survivre à un changement d'onglet.
const emit = defineEmits<{ announce: [tone: 'ok' | 'error', text: string] }>()

async function copyLink(): Promise<void> {
  const copied = await copyToClipboard(inviteUrl.value)

  if (copied) {
    emit('announce', 'ok', 'Lien copié dans le presse-papiers.')
  } else {
    emit('announce', 'error', 'La copie a échoué. Sélectionnez le lien et copiez-le à la main.')
  }
}

const inviteEmail = ref('')
const inviteSent = ref(false)
async function sendEmailInvite(): Promise<void> {
  await props.inviteByEmail(inviteEmail.value)
  inviteEmail.value = ''
  inviteSent.value = true
}

const answers: { value: Rsvp; label: string }[] = [
  { value: 'accepted', label: 'Je participe' },
  { value: 'invited', label: 'Je ne sais pas' },
  { value: 'declined', label: 'Je ne peux pas' },
]
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <h2 class="text-[13px] font-semibold text-label">Votre réponse</h2>
      <div class="flex gap-1.5 rounded-field bg-fill p-1">
        <button
          v-for="answer in answers"
          :key="answer.value"
          type="button"
          :disabled="rsvpBusy"
          class="h-11 flex-1 rounded-control text-[13px]"
          :class="
            event.viewer.rsvp === answer.value
              ? 'bg-surface font-semibold shadow-rest'
              : 'font-medium text-muted'
          "
          @click="reply(answer.value)"
        >
          {{ answer.label }}
        </button>
      </div>
    </div>

    <ul class="flex flex-col rounded-card border border-line bg-surface">
      <li
        v-for="participant in event.participants"
        :key="participant.userId"
        class="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
      >
        <span
          class="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-press"
        >
          {{ participant.name.slice(0, 2).toUpperCase() }}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate text-sm font-medium">{{ participant.name }}</span>
          <span v-if="participant.role === 'admin'" class="text-xs text-faint">Organisateur</span>
        </span>
        <span
          class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
          :class="rsvpTone[participant.rsvp]"
        >
          {{ rsvpLabel[participant.rsvp] }}
        </span>
      </li>

      <!--
        Invitations nominatives sans réponse, visibles du seul organisateur. Elles répondent à
        « qui ai-je invité qui n'a rien dit ? ». Un lien partageable n'a pas de destinataire
        et n'en produit aucune.
      -->
      <li
        v-for="invitation in event.pendingInvitations"
        :key="invitation.id"
        class="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0"
      >
        <span class="h-8.5 w-8.5 shrink-0 rounded-full border border-dashed border-field"></span>
        <span class="min-w-0 flex-1 truncate text-sm text-faint italic">
          {{ invitation.email }}
        </span>
        <span class="shrink-0 rounded-lg bg-wait px-2.5 py-1 text-xs font-semibold text-wait-ink">
          Invitation envoyée
        </span>
      </li>
    </ul>

    <p
      v-if="isAdmin && event.pendingInvitations.length > 0"
      class="text-xs leading-relaxed text-faint"
    >
      Ces personnes ont reçu une invitation et n'ont pas encore répondu. Vous seul voyez cette
      liste.
    </p>

    <section v-if="isAdmin" class="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 class="text-sm font-semibold">Inviter</h2>

      <form class="flex gap-2" @submit.prevent="sendEmailInvite">
        <label class="sr-only" for="invite-email">Inviter par e-mail</label>
        <input
          id="invite-email"
          v-model="inviteEmail"
          type="email"
          required
          placeholder="adresse@exemple.fr"
          class="h-12 min-w-0 flex-1 rounded-control border border-field bg-surface px-3.5 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        />
        <button
          type="submit"
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-accent text-white"
          aria-label="Envoyer l'invitation"
        >
          <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 12h15M13.5 6.5 20 12l-6.5 5.5" />
          </svg>
        </button>
      </form>

      <p v-if="inviteSent" class="text-xs leading-relaxed text-faint">
        Si un compte existe pour cette adresse, l'invitation lui a été transmise ; sinon un
        courriel d'invitation vient de partir.
      </p>

      <button
        type="button"
        class="flex h-12 items-center justify-center gap-2 rounded-control border border-field text-sm font-medium text-ink-2"
        @click="generateLink"
      >
        <svg viewBox="0 0 24 24" class="h-4.5 w-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
          <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
        </svg>
        Créer un lien partageable
      </button>

      <div v-if="inviteUrl" class="flex gap-2">
        <input
          :value="inviteUrl"
          aria-label="Lien d'invitation à partager"
          readonly
          class="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 text-xs text-muted"
        />
        <button
          type="button"
          class="flex h-11 shrink-0 items-center rounded-control bg-ink px-3.5 text-xs font-semibold text-white"
          @click="copyLink"
        >
          Copier
        </button>
      </div>
    </section>

    <section
      v-if="isAdmin"
      class="flex flex-wrap items-end gap-2.5 rounded-card border border-line bg-surface p-4"
    >
      <label class="flex flex-1 flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-label">Statut de l'événement</span>
        <select
          id="status"
          v-model="statusDraft"
          class="h-11 rounded-control border border-field bg-surface px-3 text-[13px] font-medium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
        >
          <option value="">Changer…</option>
          <option value="draft">Brouillon</option>
          <option value="active">En cours</option>
          <option value="closed">Clôturé</option>
        </select>
      </label>
      <button
        type="button"
        class="flex h-11 items-center rounded-control bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
        :disabled="statusDraft === ''"
        @click="changeStatus"
      >
        Appliquer
      </button>
    </section>
  </section>
</template>

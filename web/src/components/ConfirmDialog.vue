<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  tone: 'danger' | 'neutral'
}>()

const emit = defineEmits<{ answer: [value: boolean] }>()

const cancelButton = ref<HTMLButtonElement | null>(null)

// Le focus part sur Annuler : Entrée ne doit pas confirmer par accident un geste destructif.
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    cancelButton.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-30 flex items-center justify-center bg-ink/28 p-5"
    @click.self="emit('answer', false)"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      class="flex w-full max-w-md flex-col gap-4 rounded-surface border border-line bg-surface p-5 shadow-float md:p-7"
      @keydown.esc="emit('answer', false)"
    >
      <div class="flex flex-col gap-1.5">
        <h2 id="confirm-title" class="text-base font-semibold">{{ title }}</h2>
        <p class="text-[13px] leading-relaxed text-ink-2">{{ message }}</p>
      </div>

      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref="cancelButton"
          type="button"
          data-answer="no"
          class="flex h-11 items-center justify-center rounded-control border border-field px-4 text-sm font-semibold"
          @click="emit('answer', false)"
        >
          Annuler
        </button>
        <button
          type="button"
          data-answer="yes"
          class="flex h-11 items-center justify-center rounded-control px-4 text-sm font-semibold text-white"
          :class="tone === 'danger' ? 'bg-fail-ink' : 'bg-accent'"
          @click="emit('answer', true)"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

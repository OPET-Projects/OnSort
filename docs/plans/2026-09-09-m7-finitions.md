# Jalon M7 — finitions : pourcentage, montant fixe, réordonnancement, annulation

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** trois finitions que la conception décrit depuis le début et que les jalons
précédents ont délibérément reportées. Une dépense se partage autrement qu'à parts égales,
un programme se réordonne, une activité s'annule sans disparaître.

**Architecture :** rien de nouveau. Les trois s'appuient sur des structures déjà en place —
`split_mode` porte ses trois valeurs depuis M3, `position` existe depuis M2, et
`activity.cancelled` figure dans §2.9 et §5.2 sans avoir jamais eu de déclencheur.

**Conception :** [`../conception.md`](../conception.md) — sections 2.7, 2.8, 2.9, 3.5, 3.7,
3.8, 5.1, 5.2, 9. **Fait autorité.**
**Jalon précédent :** [`2026-09-09-m6-amis-notifications.md`](2026-09-09-m6-amis-notifications.md).

## Contraintes globales

- Aucune montée de version, **aucune dépendance nouvelle**. Le réordonnancement se fait par
  boutons, pas par glisser-déposer : une bibliothèque de plus ne se justifie pas, et des
  boutons restent utilisables au clavier et au doigt.
- **Une migration par jalon.** M7 ajoute exactement une colonne : `activities.cancelled_at`.
- **Argent en centimes entiers.** Les trois modes de partage produisent des entiers, et
  l'invariant `SUM(parts) = montant` vaut dans les trois.
- Portes avant **chaque** commit, **chacune lancée seule**, jamais à travers un tube.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**

## Périmètre

**Dans M7 :**

| Domaine | Contenu |
| --- | --- |
| Base | Colonne `cancelled_at`, migration `m7_cancellation` |
| Pur | `lib/money.ts` — `splitByPercent`, `splitByFixed` |
| API | `split_mode` honoré à la saisie, `PATCH /events/:id/activities/order`, `POST /activities/:id/cancel` |
| Temps réel | `activity.cancelled`, dernier des onze types de §5.2 sans déclencheur |
| Notification | `activity.cancelled`, dernier des dix de §2.9 |
| Front | Choix du mode dans le formulaire de dépense, flèches de réordonnancement, annuler et rétablir |

**Hors M7 :**

| Écarté | Motif |
| --- | --- |
| Glisser-déposer | Demanderait une dépendance ; des flèches font le même travail et restent accessibles |
| Suppression d'une activité | §3.7 est explicite : `cancelled_at` est renseigné, **sans suppression physique** |
| Détacher les dépenses d'une activité annulée | §3.7 : elles survivent — « un acompte non remboursable existe » |

---

## Décisions de ce jalon à consigner

1. **Une annulation se rétablit.** §3.7 ne décrit que la mise en place de `cancelled_at`,
   mais la règle du projet interdit les états absorbants. Annuler par erreur ne doit pas être
   définitif.
2. **Une activité annulée reste dans le programme**, barrée, et son vote se ferme. La retirer
   de la liste reviendrait à la supprimer aux yeux de l'utilisateur, ce que §3.7 refuse.
3. **Les dépenses d'une activité annulée ne bougent pas.** §3.7 : « les dépenses associées
   survivent — un acompte non remboursable existe ». Les soldes sont calculés par événement,
   pas par activité : il n'y a donc rien à faire, et c'est justement le point à ne pas
   « corriger ».
4. **Le réordonnancement reçoit la liste complète des identifiants**, pas un déplacement.
   Envoyer « monte celle-ci d'un cran » ferait dépendre le résultat de l'ordre supposé par le
   client, qui peut être périmé. Une liste complète est vérifiable : elle doit contenir
   exactement les activités de l'événement.
5. **Réordonner et annuler sont réservés à l'administrateur.** §3.8 attribue « trancher le
   vote » et « clore l'événement » à l'administrateur ; l'ordre du programme et l'annulation
   relèvent de la même catégorie — ils engagent le groupe, pas une proposition personnelle.
6. **En pourcentage, le reste suit la même règle qu'à parts égales** : les premiers
   participants triés par identifiant reçoivent un centime supplémentaire. Une seconde règle
   d'arrondi dans le même fichier finirait par diverger de la première.

---

## Tâche 1 : la colonne d'annulation

**Fichiers :** `api/prisma/schema.prisma`, migration `m7_cancellation`,
`api/tests/schema-m7.test.ts`.

- [ ] **Test qui échoue** : une activité naît non annulée ; `cancelled_at` accepte une date ;
      annuler ne supprime ni l'activité, ni ses votes, ni ses dépenses.
- [ ] **Modèle** : `cancelledAt DateTime? @map("cancelled_at")` sur `Activity`.
- [ ] Migration — **aucune contrainte à ajouter** : une date nulle ou passée sont toutes deux
      valides, et interdire une date future n'aurait pas de sens pour une annulation
      programmée.
- [ ] Portes, commit.

---

## Tâche 2 : partage en pourcentage et en montant fixe

**Fichiers :** `api/src/lib/money.ts`, `api/tests/lib/money.test.ts`.

**Interfaces :**

```ts
export function splitByPercent(
  amountCents: number,
  weights: readonly { participantId: string; percent: number }[],
): Share[]

export function splitByFixed(
  amountCents: number,
  parts: readonly { participantId: string; amountCents: number }[],
): Share[]
```

- [ ] **Test qui échoue** — couvrir :
  - un partage 50/50 sur un montant impair tient l'invariant ;
  - 30/30/40 sur 1000 rend 300/300/400 ;
  - des pourcentages qui ne totalisent pas 100 lèvent ;
  - un pourcentage négatif lève ;
  - le reste va aux **premiers identifiants triés**, comme à parts égales ;
  - en montant fixe, une somme différente du total lève, avec l'écart dans le message ;
  - en montant fixe, une part nulle est acceptée — quelqu'un peut ne rien devoir ;
  - une part négative lève.

> **L'invariant `SUM(parts) = montant` vaut dans les trois modes.** C'est ce qui permet à
> `computeBalances` de ne rien savoir du mode de partage : il additionne des parts, et
> ignore comment elles ont été obtenues.

- [ ] Implémentation, portes, commit.

---

## Tâche 3 : saisir une dépense dans les trois modes

**Fichiers :** `api/src/modules/expenses/{schema,service}.ts`,
`api/tests/modules/expense-splits.test.ts`.

- [ ] **Schéma** : `shares` facultatif, une liste de `{ participantId, percent }` ou
      `{ participantId, amountCents }` selon `splitMode`. Une union discriminée sur
      `splitMode` plutôt que trois champs facultatifs : le schéma refuse ainsi les
      combinaisons absurdes au lieu de les laisser au service.
- [ ] **Test qui échoue** — couvrir les trois modes de bout en bout, l'invariant vérifié en
      base, un mode `percent` sans pourcentages refusé, et un bénéficiaire étranger refusé
      comme en M3.
- [ ] **Service** : `createExpense` et `updateExpense` choisissent la fonction de partage.
- [ ] Portes, commit.

---

## Tâche 4 : réordonner le programme

**Fichiers :** `api/src/modules/{events,activities}/*`,
`api/tests/modules/activity-order.test.ts`.

**Route :** `PATCH /api/events/:id/activities/order`, corps `{ activityIds: string[] }`.

- [ ] **Test qui échoue** — couvrir :
  - l'ordre demandé devient l'ordre rendu par `GET .../activities` ;
  - une liste incomplète est refusée — le résultat serait ambigu pour les absentes ;
  - une liste contenant une activité d'un autre événement est refusée ;
  - un doublon est refusé ;
  - réservé à l'administrateur ;
  - la diffusion `activity.updated` part une seule fois, pas une par activité.

> Les positions sont réécrites **dans une transaction**. À mi-chemin, deux activités
> partageraient la même position et le programme aurait deux troisièmes places.

- [ ] Portes, commit.

---

## Tâche 5 : annuler et rétablir une activité

**Fichiers :** `api/src/modules/activities/{schema,service,routes}.ts`,
`api/tests/modules/activity-cancel.test.ts`.

**Route :** `POST /api/activities/:id/cancel`, corps `{ cancelled: boolean }`.

- [ ] **Test qui échoue** — couvrir :
  - annuler renseigne `cancelled_at` sans rien supprimer ;
  - **les dépenses rattachées survivent** et les soldes ne bougent pas (§3.7) ;
  - les votes survivent ;
  - voter sur une activité annulée est refusé ;
  - rétablir remet `cancelled_at` à nul — aucun état n'est absorbant ;
  - réservé à l'administrateur ;
  - `activity.cancelled` est diffusé **et** notifié aux participants ayant accepté, sauf
    l'auteur.

- [ ] Étendre `NotificationType` de `lib/notify.ts` avec `activity.cancelled` : c'était le
      dernier des dix types de §2.9 sans déclencheur.
- [ ] Portes, commit.

---

## Tâche 6 : front

**Fichiers :** `web/src/components/ActivityCard.vue`, `ExpenseForm` dans `EventView.vue`,
`web/src/composables/{useActivities,useExpenses}.ts`, tests.

- [ ] **Dépense** : un sélecteur de mode. En `equal`, rien de plus. En `percent`, un champ
      par bénéficiaire avec le total affiché en direct — un formulaire qui n'indique pas
      qu'il manque 3 % se solde par un refus incompréhensible. En `fixed`, idem avec les
      montants et l'écart au total.
- [ ] **Ordre** : deux flèches par activité, pour l'administrateur seul. Désactivées aux
      extrémités.
- [ ] **Annulation** : un bouton **Annuler** pour l'administrateur, **Rétablir** ensuite.
      L'activité annulée reste affichée, barrée, son vote fermé, avec un mot expliquant que
      ses dépenses restent comptées.
- [ ] Tests des composables : les trois modes, l'ordre transmis, l'annulation et le
      rétablissement.

---

## Tâche 7 : documentation

- [ ] `journal-decisions.md` : les six décisions, avec leur coût.
- [ ] `conception.md` : §5.1 si la surface a bougé — `POST /activities/:id/cancel` y figure
      déjà, vérifier la forme du corps.
- [ ] `CLAUDE.md`, `README.md`, `workflow.md` : **M7 terminé, tous les jalons livrés.**
- [ ] Retirer des documents les mentions « arrive en M7 » devenues fausses.

## Vérification finale

- [ ] Les trois portes, `npm run build`.
- [ ] Une dépense en pourcentage et une en montant fixe, vérification en base que
      `SUM(parts) = montant` dans les deux.
- [ ] Un programme réordonné, une activité annulée puis rétablie, ses dépenses toujours dans
      les soldes.
- [ ] **Vérifier qu'aucun des onze types de §5.2 ni des dix de §2.9 ne reste sans
      déclencheur.** C'est le dernier jalon : la liste doit être complète.

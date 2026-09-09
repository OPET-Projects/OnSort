# Jalon M6 — amis et notifications complètes

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** on se lie à quelqu'un, et l'application prévient — une invitation reçue, une
activité à voter, une dépense saisie, un virement confirmé arrivent **en direct** dans une
liste de notifications, sans recharger.

**Architecture :** les notifications sont **écrites en base puis diffusées**, jamais l'un
sans l'autre : le flux temps réel sert à celui qui regarde, la table à celui qui revient.
Le bus SSE de M2 est réutilisé tel quel, en lui ajoutant des salons personnels à côté des
salons d'événement.

**Conception :** [`../conception.md`](../conception.md) — sections 2.2, 2.9, 4, 5.1, 5.2,
6.1, 6.2, 9. **Fait autorité.**
**Jalon précédent :** [`2026-09-09-m5-carte-geocodage.md`](2026-09-09-m5-carte-geocodage.md).

## Contraintes globales

- Aucune montée de version, aucune dépendance nouvelle.
- **Une migration par jalon.** M6 ajoute exactement trois tables : `friend_requests`,
  `friendships`, `notifications`.
- **Anti-énumération** (§4) : demander quelqu'un en ami par son adresse rend **toujours** la
  même réponse, que le compte existe ou non.
- Portes avant **chaque** commit, **chacune lancée seule**.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**
- Une notification n'échoue jamais l'action qui la déclenche.

## Périmètre

**Dans M6 :**

| Domaine | Contenu |
| --- | --- |
| Base | `FriendRequest`, `Friendship`, `Notification`, migration `m6_social` |
| Pur | `lib/friendship.ts` — normalisation du couple, état d'une relation |
| Bus | `lib/sse.ts` — salons personnels à côté des salons d'événement |
| API amis | `GET /api/friends`, `POST /api/friends/requests`, `POST /api/friends/requests/:id/accept`, `.../decline` |
| API notifications | `GET /api/notifications`, `POST /api/notifications/:id/read`, `GET /api/me/stream` |
| Émission | Neuf des dix types de §2.9, depuis les services de M1 à M5 |
| Front | `/friends`, cloche de notifications dans l'entête, flux personnel |

**Hors M6 :**

| Écarté | Motif |
| --- | --- |
| `activity.cancelled` | §9 range l'annulation en M7 : le type existe dans §2.9, l'événement qui le déclenche n'existe pas encore |
| Notifications poussées par le navigateur | `README.md` les range en V2 |
| Relance automatique des non-votants | §10 point 1 : « hors périmètre, elle demanderait une tâche planifiée » |
| Retirer un ami, bloquer quelqu'un | §2.2 ne décrit ni l'un ni l'autre |
| Inviter un ami à un événement en un clic | Tentant, mais §9 borne M6 à « amis, notifications complètes » |

---

## Décisions de ce jalon à consigner

1. **Le bus SSE gagne des salons personnels sans changer de forme.** `lib/sse.ts` indexe
   déjà par une chaîne quelconque ; les salons personnels sont préfixés `user:`. Écrire un
   second bus dupliquerait la gestion des abonnés et des connexions mortes.
2. **Une notification est écrite puis diffusée, jamais seulement diffusée.** Le flux sert à
   celui qui regarde, la table à celui qui revient. Diffuser sans écrire perdrait tout pour
   qui n'était pas connecté — c'est-à-dire le cas courant.
3. **Une notification qui échoue n'échoue pas l'action.** Saisir une dépense ne doit pas être
   perdu parce qu'une notification n'a pas pu être écrite.
4. **Demander quelqu'un en ami se fait par adresse, et la réponse est toujours la même**
   (§4). Un compte existant reçoit une demande ; une adresse inconnue reçoit un courriel
   d'invitation. L'appelant ne peut pas distinguer les deux.
5. **Une demande croisée vaut acceptation.** Si A a demandé B et que B demande A, refuser
   pour cause de doublon serait absurde : les deux veulent la même chose. La seconde demande
   accepte la première.
6. **Le `payload` porte de quoi afficher une ligne, et rien de plus.** Un titre, un prénom.
   Ni adresse, ni montant nominatif : une notification voyage vers un flux qu'on ne relit pas
   au moment de la produire.

---

## Tâche 1 : modèles et migration

**Fichiers :** `api/prisma/schema.prisma`, migration `m6_social`,
`api/tests/helpers/db.ts`, `api/tests/schema-m6.test.ts`.

- [ ] **Test qui échoue** — couvrir :
  - une demande d'ami, une amitié, une notification s'enregistrent ;
  - `UNIQUE(from_user_id, to_user_id)` interdit la demande en double ;
  - la contrainte `user_a_id < user_b_id` refuse un couple non normalisé ;
  - une amitié avec soi-même est refusée ;
  - `read_at` est nul à la création ;
  - supprimer un utilisateur emporte ses notifications.

- [ ] **Modèles**

```prisma
enum FriendRequestStatus {
  pending
  accepted
  declined
}

model FriendRequest {
  id         String              @id @default(uuid())
  fromUserId String              @map("from_user_id")
  fromUser   User                @relation("FriendRequestFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUserId   String              @map("to_user_id")
  toUser     User                @relation("FriendRequestTo", fields: [toUserId], references: [id], onDelete: Cascade)
  status     FriendRequestStatus @default(pending)
  createdAt  DateTime            @default(now()) @map("created_at")

  @@unique([fromUserId, toUserId])
  @@index([toUserId, status])
  @@map("friend_requests")
}

// Le couple est **normalisé** par la contrainte `user_a_id < user_b_id` posée en migration :
// une amitié occupe une seule ligne, et « sommes-nous amis » est une lecture directe, sans
// disjonction (§2.2).
model Friendship {
  userAId   String   @map("user_a_id")
  userA     User     @relation("FriendshipA", fields: [userAId], references: [id], onDelete: Cascade)
  userBId   String   @map("user_b_id")
  userB     User     @relation("FriendshipB", fields: [userBId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@id([userAId, userBId])
  @@index([userBId])
  @@map("friendships")
}

model Notification {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventId   String?  @map("event_id")
  type      String
  payload   Json     @default("{}")
  readAt    DateTime? @map("read_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt])
  @@map("notifications")
}
```

- [ ] **Migration**, puis y ajouter **avant première application** :

```sql
-- Normalise le couple : une amitié occupe une seule ligne (§2.2).
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_ordered_pair"
  CHECK ("user_a_id" < "user_b_id");

-- On ne se demande pas soi-même en ami.
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_distinct_users"
  CHECK ("from_user_id" <> "to_user_id");
```

- [ ] `TABLES` de `db.ts` étendu de trois lignes, **en tête**.
- [ ] Portes, commit.

---

## Tâche 2 : normalisation du couple

**Fichiers :** `api/src/lib/friendship.ts`, `api/tests/lib/friendship.test.ts`.

**Interfaces :**

```ts
export type Pair = { userAId: string; userBId: string }
export function normalisePair(first: string, second: string): Pair
export function otherSide(pair: Pair, viewerId: string): string
```

- [ ] **Test qui échoue** : l'ordre des arguments est indifférent ; deux appels symétriques
      rendent le même couple ; un couple identique lève ; `otherSide` rend l'autre.
- [ ] Implémentation, portes, commit.

> La normalisation vit dans une fonction pure parce qu'elle est appelée à l'écriture **et** à
> la lecture. Deux implémentations de la même règle finiraient par diverger, et une amitié
> écrite dans un sens ne se lirait plus dans l'autre.

---

## Tâche 3 : salons personnels dans le bus

**Fichiers :** `api/src/lib/sse.ts`, `api/tests/lib/sse.test.ts`.

**Interfaces :** `export function userRoom(userId: string): string`

- [ ] **Test qui échoue** : un message publié dans le salon d'un utilisateur ne parvient pas
      à un autre ; un salon d'événement et un salon personnel de même identifiant ne se
      confondent pas.
- [ ] **Implémentation** : `userRoom` préfixe `user:`. Rien d'autre ne change.

> Le préfixe n'est pas cosmétique : sans lui, un identifiant d'utilisateur égal à un
> identifiant d'événement mêlerait deux flux. Les deux sont des UUID, la collision est
> improbable — mais « improbable » n'est pas une garantie, et le préfixe en est une.

- [ ] Portes, commit.

---

## Tâche 4 : écrire et diffuser une notification

**Fichiers :** `api/src/lib/notify.ts`, `api/tests/lib/notify.test.ts`.

**Interfaces :**

```ts
export type NotificationType =
  | 'friend.request' | 'friend.accepted'
  | 'group.invited' | 'event.invited'
  | 'activity.proposed' | 'activity.decided'
  | 'expense.created' | 'settlement.declared' | 'settlement.confirmed'

export async function notify(input: {
  userIds: readonly string[]
  type: NotificationType
  eventId?: string | null
  payload?: Record<string, unknown>
}): Promise<void>
```

- [ ] **Test qui échoue** — couvrir :
  - une ligne par destinataire ;
  - une liste vide n'écrit rien et ne diffuse rien ;
  - chaque destinataire reçoit un message **dans son propre salon** ;
  - une panne d'écriture est journalisée et **ne lève pas** ;
  - le message diffusé ne porte que `{ type, id }` — le client recharge (§5.2).

- [ ] Implémentation, portes, commit.

---

## Tâche 5 : demandes d'amitié

**Fichiers :** `api/src/modules/friends/{schema,service,routes}.ts`, `api/src/main.ts`,
`api/tests/modules/friends.test.ts`.

- [ ] **Test qui échoue** — couvrir :
  - `POST /api/friends/requests` avec une adresse connue crée une demande **et** une
    notification `friend.request` ;
  - une adresse inconnue rend **exactement la même réponse**, et envoie un courriel
    d'invitation (§4) ;
  - se demander soi-même est refusé ;
  - une demande en double est refusée sans révéler l'état de la première ;
  - **une demande croisée accepte la première** au lieu d'échouer ;
  - accepter crée l'amitié **normalisée** et notifie `friend.accepted` ;
  - refuser laisse une trace et ne crée pas d'amitié ;
  - accepter la demande d'un autre est refusé ;
  - `GET /api/friends` rend les amis et les demandes reçues en attente.

- [ ] Portes, commit.

---

## Tâche 6 : lire ses notifications, et son flux

**Fichiers :** `api/src/modules/notifications/{schema,routes,service}.ts`,
`api/src/main.ts`, `api/tests/modules/notifications.test.ts`.

- [ ] **Test qui échoue** — couvrir :
  - `GET /api/notifications` ne rend **que les siennes**, les plus récentes d'abord, avec le
    nombre de non-lues ;
  - `POST /api/notifications/:id/read` marque lue, est idempotent, et rend **404** sur celle
    d'un autre — jamais 403, qui confirmerait son existence ;
  - `GET /api/me/stream` exige une session et diffuse dans le salon personnel ;
  - une pagination bornée : sans elle, un compte ancien rendrait tout son historique.

- [ ] Portes, commit.

---

## Tâche 7 : émettre depuis les services existants

**Fichiers :** `api/src/modules/{events,activities,expenses,groups,invitations}/service.ts`,
`api/tests/modules/notification-emission.test.ts`.

| Type | Déclencheur | Destinataires |
| --- | --- | --- |
| `event.invited` | invitation nominative à un événement | l'invité, s'il a un compte |
| `group.invited` | invitation nominative à un groupe | idem |
| `activity.proposed` | création d'une activité | participants **ayant accepté**, sauf le proposant (§2.9) |
| `activity.decided` | décision de l'administrateur | participants ayant accepté, sauf le décideur |
| `expense.created` | saisie d'une dépense | les bénéficiaires de la dépense, sauf l'auteur |
| `settlement.declared` | déclaration d'un virement | le créancier seul |
| `settlement.confirmed` | confirmation | le débiteur seul |

- [ ] **Test qui échoue** pour chaque ligne, en vérifiant **qui ne reçoit rien** autant que
      qui reçoit : l'auteur d'une action n'est jamais notifié de sa propre action.
- [ ] Portes, commit.

> `activity.proposed` est « la notification tu dois voter » (§2.9). L'envoyer à ceux qui
> n'ont pas accepté serait du bruit : ils ne peuvent pas voter.

---

## Tâche 8 : front — amis

**Fichiers :** `web/src/composables/useFriends.ts`, `web/src/views/FriendsView.vue`,
`web/src/router.ts`, `web/tests/friends.test.ts`.

- [ ] Route `/friends` (§6.1), liste des amis, demandes reçues avec accepter et refuser,
      formulaire d'ajout par adresse.
- [ ] Le message après envoi ne dit **jamais** si le compte existe : « Si un compte existe
      pour cette adresse, la demande lui a été transmise ; sinon une invitation vient de
      partir. »
- [ ] Tests : chargement, état vide, envoi, acceptation, erreur.

---

## Tâche 9 : front — notifications

**Fichiers :** `web/src/stores/notifications.ts`, `web/src/components/NotificationBell.vue`,
`web/src/composables/useUserStream.ts`, `web/src/views/HomeView.vue`,
`web/tests/notifications.test.ts`.

- [ ] **Magasin Pinia global**, comme `useSession` — §6.2 en prévoit exactement deux, et
      c'est le second. Les notifications suivent l'utilisateur d'un écran à l'autre, elles ne
      peuvent pas vivre dans un composable monté avec une vue.
- [ ] `useUserStream` ouvre `/api/me/stream` et recharge à réception.
- [ ] Cloche avec le nombre de non-lues, liste déroulante, marquage lu au clic.
- [ ] Chaque type a une phrase en français ; un type inconnu rend une ligne neutre plutôt
      qu'un vide — une notification qu'on ne sait pas rendre reste une notification.
- [ ] Tests : décompte, marquage, type inconnu.

---

## Tâche 10 : documentation

- [ ] `journal-decisions.md` : les six décisions, avec leur coût.
- [ ] `conception.md` : §5.1 si la surface a bougé.
- [ ] `CLAUDE.md`, `README.md`, `workflow.md` : état des jalons.

## Vérification finale

- [ ] Les trois portes, `npm run build`.
- [ ] Démonstration à deux navigateurs : Alice demande Bob en ami, **la cloche de Bob bouge
      sans rechargement** ; Bob accepte, celle d'Alice bouge ; Alice propose une activité,
      Bob est notifié ; Bob saisit une dépense, Alice est notifiée.
- [ ] Vérifier qu'**une action ne notifie jamais son auteur**.

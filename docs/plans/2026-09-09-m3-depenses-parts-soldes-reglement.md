# Jalon M3 — dépenses, parts, présence, soldes, virements minimisés, règlement

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** dans un événement, un participant saisit une dépense qu'il a avancée ; l'application
en fige les parts, en dérive les soldes de chacun, et propose **le plus petit jeu de virements
qui remet tout le monde à zéro**. Chaque virement se déclare puis se confirme. **Quatre
virements au lieu de dix** — c'est la démonstration de M3, et le point de coupe du projet :
à l'issue de ce jalon le produit est cohérent et se défend seul (§9).

**Architecture :** toute l'arithmétique vit dans `api/src/lib/money.ts`, fonctions pures sans
entrées-sorties — c'est là que porte l'effort de test, comme `lib/vote.ts` en M2. La couche
service lit les lignes, appelle ces fonctions et diffuse sur le bus SSE existant. **Aucun solde
n'est stocké** : `GET /events/:id/balances` recalcule à chaque appel à partir de
`expense_shares` et `settlements`.

**Stack :** aucune montée de version, aucune dépendance nouvelle. Prisma 7 + PostgreSQL 17,
Hono, zod, Vitest, Vue 3 + Tailwind.

**Conception :** [`../conception.md`](../conception.md) — sections 2.8, 3.4, 3.5, 3.6, 3.7,
3.8, 5.1, 5.2, 6.1, 7.1, 9. **Fait autorité.**
**Décisions :** [`../decisions-techniques.md`](../decisions-techniques.md).
**Versions :** [`../versions.md`](../versions.md) — aucune montée dans ce jalon.
**Jalon précédent :** [`2026-09-09-m2-activites-vote-temps-reel.md`](2026-09-09-m2-activites-vote-temps-reel.md).

## Contraintes globales

- Node **24.20.0** (`.nvmrc`). Versions **épinglées à l'exact**, aucune montée dans M3.
- **Une migration par jalon.** M3 ajoute exactement quatre tables — `expenses`,
  `expense_shares`, `settlements`, `activity_absences` — et une colonne,
  `activities.attendance_mode`. Voir « Ce que M3 ne crée pas ».
- **Argent en centimes entiers. Aucun flottant dans le domaine financier, jamais.** Pas de
  `Float`, pas de `Decimal`, pas de division non entière. Le type Prisma est `Int`, le type
  TypeScript `number` porteur d'un entier.
- Portes de vérification avant **chaque** commit, dans l'ordre :
  `npx biome check --write .` puis `npm run typecheck` puis `npm test`.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**
- Après tout `git pull` touchant `schema.prisma` : `npm run db:generate --workspace api` avant
  les portes, sinon le typage échoue sur des `TS2339` trompeurs.
- Messages de commit en anglais, Conventional Commits, corps expliquant *pourquoi*.
  **Aucune ligne d'attribution.**
- **Forme d'erreur uniforme** `{ code, message, details }` via `ApiError` — jamais de corps
  d'erreur construit à la main dans une route.
- `npm test` vide la base : relancer `npm run db:seed` avant toute démonstration.

## Périmètre

**Dans M3 :**

| Domaine | Contenu |
| --- | --- |
| Base | `Expense`, `ExpenseShare`, `Settlement`, `ActivityAbsence`, colonne `attendance_mode`, migration `m3_expenses` |
| Pur | `lib/money.ts` — `splitEqually`, `computeBalances`, `minimizeTransfers` |
| Permissions | `canRecordExpense(rsvp)`, `canDeclareSettlement`, `canConfirmSettlement` |
| API dépenses | `POST`/`GET /api/events/:id/expenses`, `PATCH /api/expenses/:id` |
| API présence | `POST /api/activities/:id/attendance`, `attendance_mode` via `PATCH /api/activities/:id` |
| API soldes | `GET /api/events/:id/balances` — soldes **et** virements minimisés |
| API règlements | `POST /api/events/:id/settlements`, `POST /api/settlements/:id/confirm`, `DELETE /api/settlements/:id` |
| Temps réel | `expense.created`, `expense.updated`, `settlement.declared`, `settlement.confirmed` |
| Front | Onglet **Dépenses** actif : liste, saisie, soldes, virements proposés, déclaration et confirmation |

**Hors M3 — appartient à un jalon nommé, ne pas anticiper :**

| Écarté | Jalon | Motif |
| --- | --- | --- |
| Interface de partage en **pourcentage** et en **montant fixe** | **M7** | §9 range « pourcentage et montant fixe » en M7. L'enum `split_mode` porte les trois valeurs dès M3 car le stockage est identique (§2.8 note 3) ; seul `equal` est proposé par l'interface |
| `cancelled_at` sur une activité, `POST /activities/:id/cancel` | **M7** | §9 range l'annulation en M7. §3.7 est donc hors périmètre : aucune dépense orpheline à traiter tant qu'aucune activité ne s'annule |
| Notifications `expense.created`, `settlement.declared`, `settlement.confirmed` en table | **M6** | §9 range les notifications en M6. M3 les diffuse sur le flux SSE, il ne les persiste pas |
| Colonnes `lat`, `lng` | **M5** | Elles arrivent avec le géocodage BAN et la carte |
| Devise autre que `EUR` | — | La colonne `currency` existe avec son défaut `'EUR'` (§2.8) ; aucune conversion, aucun sélecteur. Une dépense en devise étrangère est hors sujet du cours |

**Ce que M3 ne crée pas**, bien que §2.8 les mentionne : rien. Les trois tables de §2.8 sont
créées en entier. `activity_absences` et `attendance_mode`, annoncés « en M3 » par le
commentaire de `schema.prisma` posé en M2, le sont aussi.

---

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `api/src/lib/money.ts` | **Créé.** Arithmétique pure : répartition, soldes, minimisation |
| `api/src/lib/permissions.ts` | **Modifié.** Trois prédicats de plus |
| `api/src/modules/expenses/schema.ts` | **Créé.** Schémas zod des corps de requête |
| `api/src/modules/expenses/service.ts` | **Créé.** Règles métier dépenses, soldes, règlements |
| `api/src/modules/expenses/routes.ts` | **Créé.** `PATCH /expenses/:id` |
| `api/src/modules/settlements/routes.ts` | **Créé.** `POST /settlements/:id/confirm`, `DELETE /settlements/:id` |
| `api/src/modules/events/routes.ts` | **Modifié.** Trois routes montées sous `/events/:id` |
| `api/src/modules/activities/*` | **Modifié.** Présence et `attendance_mode` |
| `api/src/main.ts` | **Modifié.** Deux `route()` de plus |
| `api/tests/helpers/db.ts` | **Modifié.** `TABLES` étendu de quatre lignes |
| `web/src/composables/useExpenses.ts` | **Créé.** Dépenses et soldes d'un événement |
| `web/src/components/ExpenseCard.vue` | **Créé.** Une dépense en liste |
| `web/src/components/BalanceSheet.vue` | **Créé.** Soldes, virements proposés, règlements |
| `web/src/views/EventView.vue` | **Modifié.** L'onglet « Dépenses · à venir » devient réel |

Le découpage suit celui de M2 : `schema.ts` décrit la forme, `service.ts` porte la règle et
lève des `ApiError`, `routes.ts` n'est qu'un adaptateur Hono. `lib/` ne dépend jamais du
client Prisma généré.

---

## Décisions de ce jalon à consigner

À reporter dans [`../journal-decisions.md`](../journal-decisions.md), avec leur coût :

1. **Seuls les règlements confirmés entrent dans le solde.** §3.5 écrit « + transferts reçus
   − transferts émis » sans distinguer `declared_at` de `confirmed_at`. Retenu : un règlement
   déclaré mais non confirmé **ne bouge pas** le solde ; il est affiché à part, « en attente de
   confirmation ». Motif : c'est la raison d'être des deux états de §3.6 — « celui qui doit ne
   pouvant pas décider seul qu'il a payé ». Compter la déclaration donnerait au débiteur le
   pouvoir d'effacer sa dette seul, exactement ce que §3.6 refuse.
2. **`DELETE /api/settlements/:id` ajouté à la surface HTTP.** §5.1 ne liste que la
   déclaration et la confirmation. Sans retrait, un virement déclaré par erreur — mauvais
   destinataire, mauvais montant — reste éternellement en attente et le créancier ne peut ni
   le confirmer ni le refuser : un état bloqué, que les règles métier du projet interdisent.
   Retenu : le **débiteur** peut retirer sa propre déclaration **tant qu'elle n'est pas
   confirmée**. Après confirmation, la ligne est définitive — un règlement est un fait, pas un
   brouillon ; la corriger passe par un règlement inverse.
3. **`GET /api/events/:id/expenses` ajouté à la surface HTTP.** Même situation qu'en M2 pour
   les activités : §5.1 liste la création mais pas la lecture, alors que §6.1 prévoit un écran
   qui les affiche. La liste est ouverte à **tout** participant, y compris celui qui n'a pas
   répondu — savoir ce que la sortie coûte aide à décider si l'on vient.
4. **Modifier une dépense est réservé à son auteur et aux administrateurs.** §3.8 dit qui
   *saisit* une dépense, pas qui la corrige. Aligné sur le précédent de M2 pour les activités
   (proposant + administrateur), pour la même raison : une faute de frappe doit pouvoir être
   corrigée sans mobiliser un administrateur, et un administrateur doit pouvoir réparer la
   faute de quelqu'un qui a quitté la conversation.
5. **La modification d'une dépense recalcule ses parts.** §2.8 note 2 fige les parts « à la
   saisie » contre les changements de **présence et de liste de participants** — pas contre la
   correction de la dépense elle-même. Changer le montant sans changer les parts violerait
   l'invariant `SUM(shares) = amount`. Retenu : `PATCH` sur `amountCents` ou sur la liste des
   bénéficiaires réécrit `expense_shares` ; la présence n'y touche jamais.
6. **`attendance_mode` est porté par l'activité, pas par l'événement.** §3.4 dit
   « l'administrateur peut le changer à tout moment » sans nommer le porteur ; §2.7 le liste
   dans les colonnes d'`activities`, et le commentaire de `schema.prisma` posé en M2 l'annonce
   sur cette table. La présence se raisonne par activité — on saute le musée, pas la sortie.

---

## Tâche 1 : modèles, migration, remise à zéro des tests

**Fichiers :**
- Modifier : `api/prisma/schema.prisma`
- Créer : `api/prisma/migrations/<horodatage>_m3_expenses/migration.sql` (généré)
- Modifier : `api/tests/helpers/db.ts`
- Créer : `api/tests/schema-m3.test.ts`

**Interfaces :**
- Produit : modèles `Expense`, `ExpenseShare`, `Settlement`, `ActivityAbsence` ; enums
  `SplitMode`, `AttendanceMode` ; champ `Activity.attendanceMode`.

- [ ] **Étape 1 : écrire le test qui échoue**

`api/tests/schema-m3.test.ts` — calqué sur `schema-m2.test.ts` : il vérifie que les tables
existent, que l'invariant financier est tenable et que les contraintes mordent.

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.ts'
import { resetDatabase } from './helpers/db.ts'
import { seedEventWithParticipants } from './helpers/fixtures.ts'

describe('schéma M3', () => {
  beforeEach(resetDatabase)

  it('enregistre une dépense, ses parts et un règlement', async () => {
    const { eventId, participants } = await seedEventWithParticipants(3)
    const [payer, other] = participants

    const expense = await prisma.expense.create({
      data: {
        eventId,
        label: 'Taxi',
        amountCents: 1000,
        paidBy: payer.id,
        splitMode: 'equal',
        createdBy: payer.id,
        shares: {
          create: [
            { participantId: payer.id, amountCents: 500 },
            { participantId: other.id, amountCents: 500 },
          ],
        },
      },
      include: { shares: true },
    })

    expect(expense.currency).toBe('EUR')
    expect(expense.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(
      expense.amountCents,
    )

    const settlement = await prisma.settlement.create({
      data: {
        eventId,
        fromParticipantId: other.id,
        toParticipantId: payer.id,
        amountCents: 500,
      },
    })

    expect(settlement.confirmedAt).toBeNull()
    expect(settlement.declaredAt).toBeInstanceOf(Date)
  })

  it('refuse un montant nul ou négatif', async () => {
    const { eventId, participants } = await seedEventWithParticipants(2)

    await expect(
      prisma.expense.create({
        data: {
          eventId,
          label: 'Gratuit',
          amountCents: 0,
          paidBy: participants[0].id,
          splitMode: 'equal',
          createdBy: participants[0].id,
        },
      }),
    ).rejects.toThrow()
  })

  it('refuse un règlement vers soi-même', async () => {
    const { eventId, participants } = await seedEventWithParticipants(2)

    await expect(
      prisma.settlement.create({
        data: {
          eventId,
          fromParticipantId: participants[0].id,
          toParticipantId: participants[0].id,
          amountCents: 100,
        },
      }),
    ).rejects.toThrow()
  })

  it("n'enregistre qu'une absence par participant et par activité", async () => {
    const { participants, activityId } = await seedEventWithParticipants(2, { withActivity: true })

    await prisma.activityAbsence.create({
      data: { activityId, participantId: participants[0].id },
    })

    await expect(
      prisma.activityAbsence.create({
        data: { activityId, participantId: participants[0].id },
      }),
    ).rejects.toThrow()
  })
})
```

`seedEventWithParticipants` n'existe pas encore : le créer dans
`api/tests/helpers/fixtures.ts`, sur le modèle de `api/tests/helpers/auth.ts`. Il crée un
utilisateur par participant, l'événement, les participations `accepted`, et — sur demande —
une activité.

```ts
import { prisma } from '../../src/db.ts'

type Options = { withActivity?: boolean }

// Jeu d'essai partagé par les tests financiers : un événement, N participants ayant accepté,
// et au besoin une activité. Les identifiants d'utilisateur sont déterministes pour que le
// départage par identifiant des restes de division soit reproductible.
export async function seedEventWithParticipants(count: number, options: Options = {}) {
  const event = await prisma.event.create({
    data: {
      title: 'Sortie',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T23:00:00Z'),
      createdBy: await createUser(0),
    },
  })

  const participants = []

  for (let index = 0; index < count; index += 1) {
    const userId = index === 0 ? event.createdBy : await createUser(index)

    participants.push(
      await prisma.eventParticipant.create({
        data: {
          eventId: event.id,
          userId,
          role: index === 0 ? 'admin' : 'member',
          rsvp: 'accepted',
        },
      }),
    )
  }

  let activityId: string | undefined

  if (options.withActivity === true) {
    const activity = await prisma.activity.create({
      data: { eventId: event.id, title: 'Musée', proposedBy: participants[0].id },
    })
    activityId = activity.id
  }

  return { eventId: event.id, participants, activityId: activityId as string }
}

async function createUser(index: number): Promise<string> {
  const user = await prisma.user.create({
    data: {
      id: `user-${index}`,
      name: `Participant ${index}`,
      email: `participant-${index}@example.test`,
    },
  })

  return user.id
}
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- schema-m3
```

Attendu : échec, `Property 'expense' does not exist on type 'PrismaClient'`.

- [ ] **Étape 3 : écrire les modèles**

Ajouter à la fin de `api/prisma/schema.prisma` :

```prisma
// --- M3 : dépenses, parts, présence, règlements ----------------------------------------
// Modèle : conception.md §2.8, §3.4, §3.5, §3.6.

// Les trois modes partagent le même stockage : `expense_shares` enregistre des montants
// absolus dans tous les cas (§2.8 note 3). `percent` et `fixed` ne coûtent que de
// l'interface, livrée en M7 ; l'enum les porte dès maintenant pour éviter une migration
// d'enum plus tard.
enum SplitMode {
  equal
  percent
  fixed
}

// `all` : les présents sont les participants ayant accepté l'événement.
// `optional` : les mêmes, moins ceux inscrits dans `activity_absences` (§3.4).
enum AttendanceMode {
  all
  optional
}

model Expense {
  id          String         @id @default(uuid())
  eventId     String         @map("event_id")
  event       Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  activityId  String?        @map("activity_id")
  activity    Activity?      @relation(fields: [activityId], references: [id], onDelete: SetNull)
  label       String
  amountCents Int            @map("amount_cents")
  currency    String         @default("EUR") @db.Char(3)
  paidBy      String         @map("paid_by")
  payer       EventParticipant @relation("ExpensePayer", fields: [paidBy], references: [id], onDelete: Cascade)
  splitMode   SplitMode      @default(equal) @map("split_mode")
  createdBy   String         @map("created_by")
  author      EventParticipant @relation("ExpenseAuthor", fields: [createdBy], references: [id], onDelete: Cascade)
  createdAt   DateTime       @default(now()) @map("created_at")
  updatedAt   DateTime       @updatedAt @map("updated_at")
  shares      ExpenseShare[]

  @@index([eventId, createdAt])
  @@map("expenses")
}

// Une part est un **montant absolu figé à la saisie** (§2.8 note 2). Elle référence une
// participation, pas un utilisateur : quitter l'événement emporte la part, comme pour un
// vote. L'unicité (dépense, participant) interdit la double part sans une ligne de code.
model ExpenseShare {
  id            String           @id @default(uuid())
  expenseId     String           @map("expense_id")
  expense       Expense          @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  participantId String           @map("participant_id")
  participant   EventParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  amountCents   Int              @map("amount_cents")

  @@unique([expenseId, participantId])
  @@index([participantId])
  @@map("expense_shares")
}

// Ligne indépendante : un virement de 20 € reste un virement de 20 € même si une dépense
// antérieure est modifiée, et le delta réapparaît dans le solde (§2.8 note 1). Deux états
// successifs, jamais un seul : le débiteur déclare, le créancier confirme (§3.6).
model Settlement {
  id                String           @id @default(uuid())
  eventId           String           @map("event_id")
  event             Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  fromParticipantId String           @map("from_participant_id")
  fromParticipant   EventParticipant @relation("SettlementDebtor", fields: [fromParticipantId], references: [id], onDelete: Cascade)
  toParticipantId   String           @map("to_participant_id")
  toParticipant     EventParticipant @relation("SettlementCreditor", fields: [toParticipantId], references: [id], onDelete: Cascade)
  amountCents       Int              @map("amount_cents")
  declaredAt        DateTime         @default(now()) @map("declared_at")
  confirmedAt       DateTime?        @map("confirmed_at")

  @@index([eventId])
  @@map("settlements")
}

// Absence à une activité, en mode `optional` seulement. L'absence est la ligne, la présence
// est l'absence de ligne : c'est le sens de §3.4, où les présents sont « les mêmes, moins
// ceux inscrits ».
model ActivityAbsence {
  activityId    String           @map("activity_id")
  activity      Activity         @relation(fields: [activityId], references: [id], onDelete: Cascade)
  participantId String           @map("participant_id")
  participant   EventParticipant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  createdAt     DateTime         @default(now()) @map("created_at")

  @@id([activityId, participantId])
  @@map("activity_absences")
}
```

Et compléter les modèles existants avec les relations inverses :

```prisma
// dans model Event
  expenses     Expense[]
  settlements  Settlement[]

// dans model EventParticipant
  expensesPaid       Expense[]         @relation("ExpensePayer")
  expensesAuthored   Expense[]         @relation("ExpenseAuthor")
  shares             ExpenseShare[]
  settlementsSent    Settlement[]      @relation("SettlementDebtor")
  settlementsReceived Settlement[]     @relation("SettlementCreditor")
  absences           ActivityAbsence[]

// dans model Activity
  attendanceMode AttendanceMode  @default(all) @map("attendance_mode")
  expenses       Expense[]
  absences       ActivityAbsence[]
```

- [ ] **Étape 4 : générer la migration**

```sh
npm run db:migrate --workspace api -- --name m3_expenses
```

Puis **éditer le `.sql` généré avant toute autre application** pour y ajouter les trois
contraintes `CHECK` que Prisma ne modélise pas. Le piège est documenté dans `CLAUDE.md` :
une `CHECK` ajoutée après la première application casse la somme de contrôle.

```sql
-- Argent en centimes entiers, strictement positif : une dépense de zéro n'est pas une
-- dépense, un montant négatif serait un remboursement déguisé (conception §2.8).
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount_cents" > 0);

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_amount_positive" CHECK ("amount_cents" > 0);

-- Un virement vers soi-même ne règle rien et fausserait la minimisation.
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_distinct_parties"
  CHECK ("from_participant_id" <> "to_participant_id");
```

Si la migration a déjà été appliquée avant l'édition, reconstruire le schéma :

```sh
docker exec onsort-db psql -U onsort -d onsort -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
npm run db:migrate --workspace api
```

- [ ] **Étape 5 : étendre la remise à zéro des tests**

`api/tests/helpers/db.ts` — ajouter les quatre tables **en tête** de `TABLES` :

```ts
const TABLES = [
  'expense_shares',
  'expenses',
  'settlements',
  'activity_absences',
  'activity_votes',
  'activities',
  // … inchangé
] as const
```

- [ ] **Étape 6 : lancer le test et le voir passer**

```sh
npm run db:generate --workspace api && npm test --workspace api -- schema-m3
```

Attendu : 4 tests passent.

- [ ] **Étape 7 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/prisma api/tests/helpers api/tests/schema-m3.test.ts
git commit -m "feat(api): add the expense, share and settlement models

The three CHECK constraints live in the migration rather than in the schema:
Prisma does not model them, and adding one after the migration has been
applied breaks its checksum."
```

---

## Tâche 2 : répartition en centimes entiers

**Fichiers :**
- Créer : `api/src/lib/money.ts`
- Créer : `api/tests/lib/money.test.ts`

**Interfaces :**
- Produit : `export type Share = { participantId: string; amountCents: number }` et
  `export function splitEqually(amountCents: number, participantIds: readonly string[]): Share[]`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest'
import { splitEqually } from '../../src/lib/money.ts'

describe('splitEqually', () => {
  it('partage un montant divisible', () => {
    expect(splitEqually(900, ['a', 'b', 'c'])).toEqual([
      { participantId: 'a', amountCents: 300 },
      { participantId: 'b', amountCents: 300 },
      { participantId: 'c', amountCents: 300 },
    ])
  })

  // Le cœur du jalon : 10 centimes entre 3 personnes ne tombe pas juste. Le reste va aux
  // premiers participants triés par identifiant, de façon déterministe (§3.5).
  it('répartit le reste sur les premiers participants triés par identifiant', () => {
    expect(splitEqually(1000, ['c', 'a', 'b'])).toEqual([
      { participantId: 'a', amountCents: 334 },
      { participantId: 'b', amountCents: 333 },
      { participantId: 'c', amountCents: 333 },
    ])
  })

  it("tient l'invariant SUM(parts) = montant sur mille montants", () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    for (let amount = 1; amount <= 1000; amount += 1) {
      const total = splitEqually(amount, ids).reduce((sum, share) => sum + share.amountCents, 0)
      expect(total).toBe(amount)
    }
  })

  it('donne tout au seul participant', () => {
    expect(splitEqually(777, ['a'])).toEqual([{ participantId: 'a', amountCents: 777 }])
  })

  it('refuse une liste vide', () => {
    expect(() => splitEqually(100, [])).toThrow()
  })

  it('refuse un montant non entier', () => {
    expect(() => splitEqually(10.5, ['a', 'b'])).toThrow()
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- money
```

Attendu : échec, `Cannot find module '../../src/lib/money.ts'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
// Arithmétique du partage des dépenses (conception §3.5). Fonctions pures, sans
// entrées-sorties : c'est là que porte l'effort de test, comme `lib/vote.ts`.
//
// **Tout est en centimes entiers.** Aucun flottant n'apparaît ici : un centime perdu dans un
// arrondi se retrouve dans un solde qui ne tombe jamais à zéro, et le groupe ne peut plus
// clore ses comptes.

export type Share = {
  participantId: string
  amountCents: number
}

function assertWholeCents(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error(`Montant en centimes attendu, reçu ${amountCents}.`)
  }
}

// Division en centimes entiers. Le reste est réparti de façon déterministe : les `reste`
// premiers participants, **triés par identifiant**, reçoivent un centime supplémentaire
// (§3.5). Le tri est ce qui rend le résultat reproductible : sans lui, deux appels sur la
// même dépense pourraient attribuer le centime supplémentaire à des personnes différentes
// selon l'ordre de lecture en base.
export function splitEqually(amountCents: number, participantIds: readonly string[]): Share[] {
  assertWholeCents(amountCents)

  if (participantIds.length === 0) {
    throw new Error('Une dépense doit être partagée entre au moins un participant.')
  }

  const sorted = [...participantIds].sort()
  const base = Math.trunc(amountCents / sorted.length)
  const remainder = amountCents - base * sorted.length

  return sorted.map((participantId, index) => ({
    participantId,
    amountCents: base + (index < remainder ? 1 : 0),
  }))
}
```

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- money
```

Attendu : 6 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/lib/money.ts api/tests/lib/money.test.ts
git commit -m "feat(api): split an amount into whole cents

Sorting by identifier before handing out the remainder is what makes the
result reproducible: without it the extra cent would follow the database
read order and move between two calls on the same expense."
```

---

## Tâche 3 : soldes dérivés

**Fichiers :**
- Modifier : `api/src/lib/money.ts`
- Modifier : `api/tests/lib/money.test.ts`

**Interfaces :**
- Consomme : `Share` de la tâche 2.
- Produit :

```ts
export type BalanceInput = {
  participantIds: readonly string[]
  expenses: readonly { paidBy: string; amountCents: number; shares: readonly Share[] }[]
  settlements: readonly { fromParticipantId: string; toParticipantId: string; amountCents: number }[]
}
export type Balance = { participantId: string; balanceCents: number }
export function computeBalances(input: BalanceInput): Balance[]
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { computeBalances } from '../../src/lib/money.ts'

describe('computeBalances', () => {
  it('crédite celui qui a avancé et débite ceux qui doivent', () => {
    const balances = computeBalances({
      participantIds: ['a', 'b'],
      expenses: [
        {
          paidBy: 'a',
          amountCents: 1000,
          shares: [
            { participantId: 'a', amountCents: 500 },
            { participantId: 'b', amountCents: 500 },
          ],
        },
      ],
      settlements: [],
    })

    expect(balances).toEqual([
      { participantId: 'a', balanceCents: 500 },
      { participantId: 'b', balanceCents: -500 },
    ])
  })

  it('éteint une dette par un règlement', () => {
    const balances = computeBalances({
      participantIds: ['a', 'b'],
      expenses: [
        {
          paidBy: 'a',
          amountCents: 1000,
          shares: [
            { participantId: 'a', amountCents: 500 },
            { participantId: 'b', amountCents: 500 },
          ],
        },
      ],
      settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 500 }],
    })

    expect(balances).toEqual([
      { participantId: 'a', balanceCents: 0 },
      { participantId: 'b', balanceCents: 0 },
    ])
  })

  // §2.8 note 1 : un règlement est une ligne indépendante. Si la dépense change après coup,
  // le virement garde sa valeur et le delta réapparaît dans le solde.
  it('laisse reparaître le delta quand la dépense change après un règlement', () => {
    const balances = computeBalances({
      participantIds: ['a', 'b'],
      expenses: [
        {
          paidBy: 'a',
          amountCents: 2000,
          shares: [
            { participantId: 'a', amountCents: 1000 },
            { participantId: 'b', amountCents: 1000 },
          ],
        },
      ],
      settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 500 }],
    })

    expect(balances).toEqual([
      { participantId: 'a', balanceCents: 500 },
      { participantId: 'b', balanceCents: -500 },
    ])
  })

  it('rend un solde nul pour un participant sans dépense ni part', () => {
    expect(computeBalances({ participantIds: ['z'], expenses: [], settlements: [] })).toEqual([
      { participantId: 'z', balanceCents: 0 },
    ])
  })

  // La somme des soldes doit toujours être nulle : c'est l'invariant qui prouve qu'aucun
  // centime n'a été créé ni perdu.
  it('somme à zéro', () => {
    const shares = splitEqually(1000, ['a', 'b', 'c'])
    const balances = computeBalances({
      participantIds: ['a', 'b', 'c'],
      expenses: [{ paidBy: 'a', amountCents: 1000, shares }],
      settlements: [{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 333 }],
    })

    expect(balances.reduce((sum, balance) => sum + balance.balanceCents, 0)).toBe(0)
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- money
```

Attendu : échec, `computeBalances is not a function`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
// Solde d'un participant = montants avancés − parts dues + transferts reçus − transferts
// émis (§3.5). **Aucun solde n'est stocké** : cette fonction est la seule source, appelée à
// chaque lecture. Un règlement compte ici **une fois confirmé** ; le filtrage se fait en
// amont, dans la couche service.
export function computeBalances(input: BalanceInput): Balance[] {
  const balanceOf = new Map<string, number>(input.participantIds.map((id) => [id, 0]))

  const add = (participantId: string, delta: number): void => {
    // Une part peut viser un participant absent de la liste — il a quitté l'événement après
    // coup. Sa part reste due : l'ignorer ferait disparaître des centimes et la somme des
    // soldes cesserait d'être nulle.
    balanceOf.set(participantId, (balanceOf.get(participantId) ?? 0) + delta)
  }

  for (const expense of input.expenses) {
    add(expense.paidBy, expense.amountCents)

    for (const share of expense.shares) {
      add(share.participantId, -share.amountCents)
    }
  }

  for (const settlement of input.settlements) {
    add(settlement.fromParticipantId, settlement.amountCents)
    add(settlement.toParticipantId, -settlement.amountCents)
  }

  return [...balanceOf.entries()]
    .map(([participantId, balanceCents]) => ({ participantId, balanceCents }))
    .sort((left, right) => left.participantId.localeCompare(right.participantId))
}
```

> **Attention au signe des règlements.** Le débiteur `from` **envoie** de l'argent : son solde
> négatif remonte vers zéro, donc `+amountCents`. Le créancier `to` **reçoit** : sa créance
> s'éteint, donc `−amountCents`. L'intuition inverse est la faute classique ; le test
> « éteint une dette par un règlement » la rattrape.

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- money
```

Attendu : 11 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/lib/money.ts api/tests/lib/money.test.ts
git commit -m "feat(api): derive balances from shares and settlements

A share may point at a participant who has since left the event. Counting it
anyway keeps the sum of balances at zero, which is the invariant that proves
no cent was created or lost."
```

---

## Tâche 4 : minimisation des virements

**Fichiers :**
- Modifier : `api/src/lib/money.ts`
- Modifier : `api/tests/lib/money.test.ts`

**Interfaces :**
- Consomme : `Balance` de la tâche 3.
- Produit :

```ts
export type Transfer = { fromParticipantId: string; toParticipantId: string; amountCents: number }
export function minimizeTransfers(balances: readonly Balance[]): Transfer[]
```

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { minimizeTransfers } from '../../src/lib/money.ts'

describe('minimizeTransfers', () => {
  it('ne propose rien quand tout est à zéro', () => {
    expect(minimizeTransfers([{ participantId: 'a', balanceCents: 0 }])).toEqual([])
  })

  it('apparie un débiteur et un créancier', () => {
    expect(
      minimizeTransfers([
        { participantId: 'a', balanceCents: 500 },
        { participantId: 'b', balanceCents: -500 },
      ]),
    ).toEqual([{ fromParticipantId: 'b', toParticipantId: 'a', amountCents: 500 }])
  })

  // La démonstration du jalon : quatre virements au lieu de dix (§9).
  it('rend au plus N−1 virements', () => {
    const balances = [
      { participantId: 'a', balanceCents: 3000 },
      { participantId: 'b', balanceCents: 1000 },
      { participantId: 'c', balanceCents: -500 },
      { participantId: 'd', balanceCents: -1500 },
      { participantId: 'e', balanceCents: -2000 },
    ]

    const transfers = minimizeTransfers(balances)

    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1)
  })

  it('éteint exactement tous les soldes', () => {
    const balances = [
      { participantId: 'a', balanceCents: 3000 },
      { participantId: 'b', balanceCents: 1000 },
      { participantId: 'c', balanceCents: -500 },
      { participantId: 'd', balanceCents: -1500 },
      { participantId: 'e', balanceCents: -2000 },
    ]

    const applied = new Map(balances.map((b) => [b.participantId, b.balanceCents]))

    for (const transfer of minimizeTransfers(balances)) {
      expect(transfer.amountCents).toBeGreaterThan(0)
      applied.set(
        transfer.fromParticipantId,
        (applied.get(transfer.fromParticipantId) as number) + transfer.amountCents,
      )
      applied.set(
        transfer.toParticipantId,
        (applied.get(transfer.toParticipantId) as number) - transfer.amountCents,
      )
    }

    for (const remaining of applied.values()) {
      expect(remaining).toBe(0)
    }
  })

  it('ignore les soldes nuls', () => {
    const transfers = minimizeTransfers([
      { participantId: 'a', balanceCents: 100 },
      { participantId: 'b', balanceCents: 0 },
      { participantId: 'c', balanceCents: -100 },
    ])

    expect(transfers).toEqual([
      { fromParticipantId: 'c', toParticipantId: 'a', amountCents: 100 },
    ])
  })

  it('est déterministe à égalité de solde', () => {
    const balances = [
      { participantId: 'b', balanceCents: -100 },
      { participantId: 'a', balanceCents: -100 },
      { participantId: 'c', balanceCents: 200 },
    ]

    expect(minimizeTransfers(balances)).toEqual(minimizeTransfers([...balances].reverse()))
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- money
```

Attendu : échec, `minimizeTransfers is not a function`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
// Minimisation des virements (§3.5) : algorithme glouton appariant le plus gros créancier
// au plus gros débiteur. Le problème est théoriquement NP-difficile ; l'heuristique est
// optimale en pratique pour N ≤ 20, ce qui couvre une sortie entre amis.
//
// Elle rend **au plus N−1 virements** : chaque appariement éteint au moins un des deux
// soldes, donc retire au moins une personne de la liste à chaque tour.
//
// Le départage par identifiant à solde égal n'est pas cosmétique : sans lui, deux
// chargements de la même page proposeraient des virements différents, et personne ne saurait
// lequel exécuter.
export function minimizeTransfers(balances: readonly Balance[]): Transfer[] {
  const creditors = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({ ...balance }))
    .sort(byAmountThenId)

  const debtors = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({ participantId: balance.participantId, balanceCents: -balance.balanceCents }))
    .sort(byAmountThenId)

  const transfers: Transfer[] = []

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0]
    const debtor = debtors[0]
    const amountCents = Math.min(creditor.balanceCents, debtor.balanceCents)

    transfers.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountCents,
    })

    creditor.balanceCents -= amountCents
    debtor.balanceCents -= amountCents

    // Au moins l'un des deux tombe à zéro à chaque tour : c'est ce qui borne le résultat à
    // N−1 virements.
    if (creditor.balanceCents === 0) creditors.shift()
    if (debtor.balanceCents === 0) debtors.shift()

    creditors.sort(byAmountThenId)
    debtors.sort(byAmountThenId)
  }

  return transfers
}

function byAmountThenId(left: Balance, right: Balance): number {
  return (
    right.balanceCents - left.balanceCents ||
    left.participantId.localeCompare(right.participantId)
  )
}
```

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- money
```

Attendu : 17 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/lib/money.ts api/tests/lib/money.test.ts
git commit -m "feat(api): propose the smallest set of transfers

Breaking ties by identifier is not cosmetic: without it two loads of the same
page would propose different transfers and nobody would know which one to run."
```

---

## Tâche 5 : permissions financières

**Fichiers :**
- Modifier : `api/src/lib/permissions.ts`
- Modifier : `api/tests/lib/permissions.test.ts`

**Interfaces :**
- Produit : `canRecordExpense(rsvp)`, `canDeclareSettlement(viewerParticipantId, settlementFrom)`,
  `canConfirmSettlement(viewerParticipantId, settlementTo)`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import {
  canConfirmSettlement,
  canDeclareSettlement,
  canRecordExpense,
} from '../../src/lib/permissions.ts'

describe('permissions financières', () => {
  it("réserve la saisie d'une dépense au participant ayant accepté", () => {
    expect(canRecordExpense('accepted')).toBe(true)
    expect(canRecordExpense('invited')).toBe(false)
    expect(canRecordExpense('declined')).toBe(false)
  })

  it('réserve la déclaration au débiteur', () => {
    expect(canDeclareSettlement('p1', 'p1')).toBe(true)
    expect(canDeclareSettlement('p2', 'p1')).toBe(false)
  })

  it('réserve la confirmation au créancier', () => {
    expect(canConfirmSettlement('p2', 'p2')).toBe(true)
    expect(canConfirmSettlement('p1', 'p2')).toBe(false)
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- permissions
```

Attendu : échec, `canRecordExpense is not a function`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Ajouter à `api/src/lib/permissions.ts` :

```ts
// « Saisir une dépense → participant **ayant accepté** » (§3.8). Même raison que pour le
// vote : un invité qui n'a pas répondu ne pèse pas sur des comptes qu'il ne partagera
// peut-être pas.
export function canRecordExpense(rsvp: Rsvp): boolean {
  return rsvp === 'accepted'
}

// « Déclarer un règlement envoyé → le débiteur » (§3.8). Un administrateur n'y a pas droit :
// personne ne peut affirmer à la place de quelqu'un d'autre qu'il a payé.
export function canDeclareSettlement(viewerId: string, fromParticipantId: string): boolean {
  return viewerId === fromParticipantId
}

// « Confirmer un règlement reçu → le créancier » (§3.8). C'est la moitié de §3.6 qui protège
// du litige : un seul état laisserait le débiteur seul juge de son propre paiement.
export function canConfirmSettlement(viewerId: string, toParticipantId: string): boolean {
  return viewerId === toParticipantId
}
```

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- permissions
```

Attendu : les tests de M2 et les 3 nouveaux passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/lib/permissions.ts api/tests/lib/permissions.test.ts
git commit -m "feat(api): decide who may record an expense and settle up

An admin cannot declare a settlement on someone else's behalf: nobody gets to
assert that another person has paid."
```

---

## Tâche 6 : saisir et lire les dépenses

**Fichiers :**
- Créer : `api/src/modules/expenses/schema.ts`
- Créer : `api/src/modules/expenses/service.ts`
- Modifier : `api/src/modules/events/routes.ts`
- Créer : `api/tests/modules/expenses.test.ts`

**Interfaces :**
- Consomme : `splitEqually`, `canRecordExpense`, `loadParticipant`, `publish`, `ApiError`.
- Produit : `createExpense(userId, eventId, input)`, `listExpenses(userId, eventId)`,
  `loadExpense(expenseId)`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../../src/main.ts'
import { signIn } from '../helpers/auth.ts'
import { resetDatabase } from '../helpers/db.ts'

describe('POST /api/events/:id/expenses', () => {
  beforeEach(resetDatabase)

  it('fige les parts à la saisie et rend 201', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Taxi', amountCents: 1001, splitMode: 'equal' }),
    })

    expect(response.status).toBe(201)

    const listed = await app.request(`/api/events/${eventId}/expenses`, { headers: bob.headers })
    const { expenses } = await listed.json()

    expect(expenses).toHaveLength(1)
    expect(expenses[0].amountCents).toBe(1001)
    expect(expenses[0].shares.reduce((s: number, p) => s + p.amountCents, 0)).toBe(1001)
  })

  it('partage entre les bénéficiaires demandés quand la liste est fournie', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    await joinEvent(eventId, 'bob@example.test')

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Musée',
        amountCents: 600,
        splitMode: 'equal',
        beneficiaryIds: [await participantIdOf(eventId, alice)],
      }),
    })

    const { expense } = await response.json()
    expect(expense.shares).toHaveLength(1)
    expect(expense.shares[0].amountCents).toBe(600)
  })

  it("refuse la saisie à un invité qui n'a pas accepté", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const carol = await inviteWithoutAccepting(eventId, 'carol@example.test')

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { ...carol.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Taxi', amountCents: 1000, splitMode: 'equal' }),
    })

    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('must_accept_first')
  })

  it('refuse un montant nul', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Gratuit', amountCents: 0, splitMode: 'equal' }),
    })

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('validation_error')
  })

  it('refuse un bénéficiaire étranger à l\'événement', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Taxi',
        amountCents: 1000,
        splitMode: 'equal',
        beneficiaryIds: ['inconnu'],
      }),
    })

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('unknown_beneficiary')
  })

  it('laisse un invité non répondant consulter la liste', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const carol = await inviteWithoutAccepting(eventId, 'carol@example.test')

    const response = await app.request(`/api/events/${eventId}/expenses`, {
      headers: carol.headers,
    })

    expect(response.status).toBe(200)
  })
})
```

Les aides `createEvent`, `joinEvent`, `inviteWithoutAccepting`, `participantIdOf` sont à
ajouter dans `api/tests/helpers/fixtures.ts` sur le modèle des tests M2
(`api/tests/modules/activities.test.ts` en contient déjà des équivalents à extraire).

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- expenses
```

Attendu : échec, 404 sur la route inexistante.

- [ ] **Étape 3 : écrire les schémas**

`api/src/modules/expenses/schema.ts` :

```ts
import { z } from 'zod'

// Schémas des corps de requête du module « dépenses ». Le montant est un **entier de
// centimes strictement positif** : c'est la frontière où l'on refuse un flottant, avant que
// le domaine financier ne le voie.
const amountCents = z.int().positive().max(100_000_000)

export const createExpenseSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amountCents,
  splitMode: z.enum(['equal', 'percent', 'fixed']).default('equal'),
  activityId: z.uuid().nullish(),
  // Absente, la dépense est partagée entre tous les participants ayant accepté. Fournie,
  // elle restreint le partage — c'est ce que la présence pré-remplit (§3.4).
  beneficiaryIds: z.array(z.string()).min(1).optional(),
})

export const updateExpenseSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    amountCents,
    activityId: z.uuid().nullable(),
    beneficiaryIds: z.array(z.string()).min(1),
  })
  .partial()

export const declareSettlementSchema = z.object({
  toParticipantId: z.string().min(1),
  amountCents,
})

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type DeclareSettlementInput = z.infer<typeof declareSettlementSchema>
```

- [ ] **Étape 4 : écrire le service**

`api/src/modules/expenses/service.ts` :

```ts
import { prisma } from '../../db.ts'
import { ApiError } from '../../lib/http.ts'
import { splitEqually } from '../../lib/money.ts'
import { canRecordExpense } from '../../lib/permissions.ts'
import { publish } from '../../lib/sse.ts'
import { loadParticipant } from '../events/service.ts'
import type { CreateExpenseInput } from './schema.ts'

// Règles métier des dépenses (conception §2.8, §3.5, §3.8). Ce fichier ne connaît pas Hono :
// il reçoit l'identifiant de l'appelant en argument et lève des `ApiError`.

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

// Bénéficiaires par défaut : les participants ayant accepté (§3.4). La liste **pré-remplit**
// sans piloter — l'appelant peut la restreindre, et `expense_shares` fige le résultat.
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

  // Les trois modes partagent le même stockage (§2.8 note 3) ; seul `equal` sait calculer
  // en M3, l'interface des deux autres arrive en M7.
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
// répondu : savoir ce que la sortie coûte aide à décider si l'on vient.
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

export { loadRecordingParticipant, resolveBeneficiaries }
```

- [ ] **Étape 5 : monter les routes**

Dans `api/src/modules/events/routes.ts`, importer puis ajouter :

```ts
  .post('/:id/expenses', jsonBody(createExpenseSchema), async (c) => {
    const expense = await createExpense(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ id: expense.id, expense }, 201)
  })
  .get('/:id/expenses', async (c) => {
    return c.json({ expenses: await listExpenses(c.get('user').id, c.req.param('id')) })
  })
```

- [ ] **Étape 6 : lancer le test et le voir passer**

```sh
npm test --workspace api -- expenses
```

Attendu : 6 tests passent.

- [ ] **Étape 7 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/modules/expenses api/src/modules/events/routes.ts api/tests
git commit -m "feat(api): record an expense and freeze its shares

The accepted-participant list pre-fills the split without driving it: the
caller may narrow it, and expense_shares freezes absolute amounts so a later
change of attendance never rewrites a past expense."
```

---

## Tâche 7 : corriger une dépense

**Fichiers :**
- Créer : `api/src/modules/expenses/routes.ts`
- Modifier : `api/src/modules/expenses/service.ts`
- Modifier : `api/src/main.ts`
- Modifier : `api/tests/modules/expenses.test.ts`

**Interfaces :**
- Produit : `updateExpense(userId, expenseId, input)` ; route `PATCH /api/expenses/:id`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe('PATCH /api/expenses/:id', () => {
  beforeEach(resetDatabase)

  it("recalcule les parts quand le montant change et tient l'invariant", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    await joinEvent(eventId, 'bob@example.test')
    const expenseId = await createExpense(eventId, alice, { label: 'Taxi', amountCents: 1000 })

    const response = await app.request(`/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ amountCents: 1001 }),
    })

    expect(response.status).toBe(200)
    const { expense } = await response.json()
    expect(expense.shares.reduce((s: number, p) => s + p.amountCents, 0)).toBe(1001)
  })

  it("refuse la correction à un participant qui n'en est ni l'auteur ni administrateur", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    const expenseId = await createExpense(eventId, alice, { label: 'Taxi', amountCents: 1000 })

    const response = await app.request(`/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...bob.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Autre' }),
    })

    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('forbidden')
  })

  it('diffuse expense.updated', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const expenseId = await createExpense(eventId, alice, { label: 'Taxi', amountCents: 1000 })

    const received: ServerEvent[] = []
    const unsubscribe = subscribe(eventId, (event) => received.push(event))

    await app.request(`/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Taxi partagé' }),
    })

    unsubscribe()

    expect(received).toEqual([{ type: 'expense.updated', id: expenseId }])
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- expenses
```

Attendu : échec, 404 sur `PATCH /api/expenses/:id`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Dans `api/src/modules/expenses/service.ts` :

```ts
export async function updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput) {
  const expense = await loadExpense(expenseId)
  const participant = await loadParticipant(userId, expense.eventId)

  // §3.8 dit qui *saisit* une dépense, pas qui la corrige. Aligné sur le précédent des
  // activités en M2 : l'auteur, et un administrateur — pour que la faute de quelqu'un qui a
  // quitté la conversation reste réparable.
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
      ? (await prisma.expenseShare.findMany({
          where: { expenseId },
          select: { participantId: true },
        })).map((share) => share.participantId)
      : await resolveBeneficiaries(expense.eventId, input.beneficiaryIds)

  // §2.8 note 2 fige les parts contre les changements de **présence** — pas contre la
  // correction de la dépense elle-même. Laisser les anciennes parts sur un nouveau montant
  // casserait l'invariant `SUM(parts) = montant`, donc on les réécrit.
  const shares = splitEqually(amountCents, beneficiaries)

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
```

`api/src/modules/expenses/routes.ts` :

```ts
import { Hono } from 'hono'
import { jsonBody } from '../../lib/validator.ts'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { updateExpenseSchema } from './schema.ts'
import { updateExpense } from './service.ts'

export const expensesRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .patch('/:id', jsonBody(updateExpenseSchema), async (c) => {
    const expense = await updateExpense(c.get('user').id, c.req.param('id'), c.req.valid('json'))
    return c.json({ expense })
  })
```

Dans `api/src/main.ts`, ajouter `.route('/api/expenses', expensesRoutes)`.

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- expenses
```

Attendu : 9 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/modules/expenses api/src/main.ts api/tests/modules/expenses.test.ts
git commit -m "feat(api): correct an expense and rewrite its shares

Freezing shares protects a past expense from a later change of attendance,
not from the correction of the expense itself: keeping the old shares on a new
amount would break SUM(shares) = amount."
```

---

## Tâche 8 : présence par activité

**Fichiers :**
- Modifier : `api/src/modules/activities/schema.ts`, `service.ts`, `routes.ts`
- Modifier : `api/src/lib/permissions.ts` (aucun ajout : `canManageEvent` suffit)
- Créer : `api/tests/modules/attendance.test.ts`

**Interfaces :**
- Produit : `setAttendance(userId, activityId, present)`, `listPresent(activityId)` ;
  routes `POST /api/activities/:id/attendance` et `attendanceMode` accepté par
  `PATCH /api/activities/:id`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe('POST /api/activities/:id/attendance', () => {
  beforeEach(resetDatabase)

  it("enregistre une absence et la retire quand on revient", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const activityId = await proposeActivity(eventId, alice, 'Musée')
    await setAttendanceMode(activityId, alice, 'optional')

    const absent = await app.request(`/api/activities/${activityId}/attendance`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ present: false }),
    })

    expect(absent.status).toBe(200)
    expect((await absent.json()).present).toBe(false)

    const back = await app.request(`/api/activities/${activityId}/attendance`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ present: true }),
    })

    expect((await back.json()).present).toBe(true)
  })

  it("refuse de se déclarer absent d'une activité en mode « all »", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const activityId = await proposeActivity(eventId, alice, 'Musée')

    const response = await app.request(`/api/activities/${activityId}/attendance`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ present: false }),
    })

    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('attendance_not_optional')
  })

  it("réserve le changement de mode à l'administrateur", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    const activityId = await proposeActivity(eventId, alice, 'Musée')

    const response = await app.request(`/api/activities/${activityId}`, {
      method: 'PATCH',
      headers: { ...bob.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ attendanceMode: 'optional' }),
    })

    expect(response.status).toBe(403)
  })

  it('pré-remplit les bénéficiaires par les présents', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    const activityId = await proposeActivity(eventId, alice, 'Musée')
    await setAttendanceMode(activityId, alice, 'optional')
    await declareAbsent(activityId, bob)

    const response = await app.request(`/api/activities/${activityId}/attendance`, {
      headers: alice.headers,
    })

    const { present } = await response.json()
    expect(present).toHaveLength(1)
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- attendance
```

Attendu : échec, 404 sur la route inexistante.

- [ ] **Étape 3 : écrire l'implémentation minimale**

Dans `api/src/modules/activities/schema.ts` :

```ts
export const attendanceSchema = z.object({
  present: z.boolean(),
})

// `attendanceMode` rejoint le schéma de modification d'une activité : c'est un réglage de
// l'activité, changeable à tout moment par l'administrateur (§3.4).
export const updateActivitySchema = z
  .object({
    // … champs existants inchangés
    attendanceMode: z.enum(['all', 'optional']),
  })
  .partial()
```

Dans `api/src/modules/activities/service.ts` :

```ts
// Présence à une activité (§3.4). L'absence est une **ligne**, la présence est l'absence de
// ligne : les présents sont « les participants ayant accepté, moins ceux inscrits dans
// activity_absences ». Le mode `all` ne connaît pas d'absence — s'en déclarer absent n'aurait
// aucun effet sur le calcul, et laisser passer l'appel ferait croire le contraire.
export async function setAttendance(userId: string, activityId: string, present: boolean) {
  const activity = await loadActivity(activityId)
  const participant = await loadAcceptedParticipant(userId, activity.eventId)

  if (activity.attendanceMode === 'all' && !present) {
    throw new ApiError(
      'attendance_not_optional',
      409,
      "La présence à cette activité n'est pas optionnelle.",
      { attendanceMode: activity.attendanceMode },
    )
  }

  if (present) {
    await prisma.activityAbsence.deleteMany({ where: { activityId, participantId: participant.id } })
  } else {
    await prisma.activityAbsence.upsert({
      where: { activityId_participantId: { activityId, participantId: participant.id } },
      create: { activityId, participantId: participant.id },
      update: {},
    })
  }

  publish(activity.eventId, { type: 'activity.updated', id: activityId })

  return { present }
}

// Liste des présents, qui **pré-remplit** le formulaire de dépense sans le piloter (§3.4).
export async function listPresent(userId: string, activityId: string) {
  const activity = await loadActivity(activityId)
  await loadParticipant(userId, activity.eventId)

  const accepted = await prisma.eventParticipant.findMany({
    where: { eventId: activity.eventId, rsvp: 'accepted' },
    include: { user: true },
  })

  if (activity.attendanceMode === 'all') {
    return accepted.map(toPresent)
  }

  const absent = new Set(
    (await prisma.activityAbsence.findMany({ where: { activityId }, select: { participantId: true } }))
      .map((row) => row.participantId),
  )

  return accepted.filter((participant) => !absent.has(participant.id)).map(toPresent)
}

function toPresent(participant: { id: string; user: { name: string } }) {
  return { participantId: participant.id, name: participant.user.name }
}
```

Dans `updateActivity`, la garde sur `attendanceMode` est réservée à l'administrateur :

```ts
  // Changer `attendance_mode` est une prérogative d'administrateur (§3.8), là où corriger
  // le titre reste ouvert au proposant.
  if (input.attendanceMode !== undefined && !canManageEvent(participant.role)) {
    throw new ApiError(
      'forbidden',
      403,
      "Seul un administrateur peut changer le mode de présence d'une activité.",
    )
  }
```

Dans `api/src/modules/activities/routes.ts` :

```ts
  .post('/:id/attendance', jsonBody(attendanceSchema), async (c) => {
    const result = await setAttendance(
      c.get('user').id,
      c.req.param('id'),
      c.req.valid('json').present,
    )
    return c.json(result)
  })
  .get('/:id/attendance', async (c) => {
    return c.json({ present: await listPresent(c.get('user').id, c.req.param('id')) })
  })
```

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- attendance
```

Attendu : 4 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/modules/activities api/tests/modules/attendance.test.ts
git commit -m "feat(api): track who skips an activity

Absence is the row and presence is its absence, which is what §3.4 describes.
Declaring yourself away from an all-attendance activity is refused rather than
silently ignored: accepting it would suggest the split had changed."
```

---

## Tâche 9 : soldes et virements proposés

**Fichiers :**
- Modifier : `api/src/modules/expenses/service.ts`
- Modifier : `api/src/modules/events/routes.ts`
- Créer : `api/tests/modules/balances.test.ts`

**Interfaces :**
- Consomme : `computeBalances`, `minimizeTransfers`.
- Produit : `getBalances(userId, eventId)` ; route `GET /api/events/:id/balances`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe('GET /api/events/:id/balances', () => {
  beforeEach(resetDatabase)

  it('dérive les soldes sans rien stocker et propose les virements', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    await createExpense(eventId, alice, { label: 'Taxi', amountCents: 1000 })

    const response = await app.request(`/api/events/${eventId}/balances`, {
      headers: bob.headers,
    })

    expect(response.status).toBe(200)
    const { balances, transfers } = await response.json()

    expect(balances.reduce((s: number, b) => s + b.balanceCents, 0)).toBe(0)
    expect(transfers).toHaveLength(1)
    expect(transfers[0].amountCents).toBe(500)
  })

  it("n'entre un règlement dans le solde qu'une fois confirmé", async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    await createExpense(eventId, alice, { label: 'Taxi', amountCents: 1000 })

    const settlementId = await declareSettlement(eventId, bob, alice, 500)

    const pending = await (
      await app.request(`/api/events/${eventId}/balances`, { headers: bob.headers })
    ).json()

    expect(pending.balances.find((b) => b.you)?.balanceCents).toBe(-500)
    expect(pending.pendingSettlements).toHaveLength(1)

    await confirmSettlement(settlementId, alice)

    const settled = await (
      await app.request(`/api/events/${eventId}/balances`, { headers: bob.headers })
    ).json()

    expect(settled.balances.every((b) => b.balanceCents === 0)).toBe(true)
    expect(settled.transfers).toEqual([])
  })

  it('rend des soldes nuls sans dépense', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)

    const { balances, transfers } = await (
      await app.request(`/api/events/${eventId}/balances`, { headers: alice.headers })
    ).json()

    expect(balances).toHaveLength(1)
    expect(balances[0].balanceCents).toBe(0)
    expect(transfers).toEqual([])
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- balances
```

Attendu : échec, 404.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
// **Aucun solde n'est stocké** (§2.8 note 1) : tout est recalculé à chaque lecture depuis
// `expense_shares` et `settlements`. C'est une lecture par événement, sur des volumes de
// sortie entre amis ; aucune optimisation n'est justifiée avant de l'avoir mesurée.
export async function getBalances(userId: string, eventId: string) {
  const viewer = await loadParticipant(userId, eventId)

  const [participants, expenses, settlements] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { eventId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.expense.findMany({ where: { eventId }, include: { shares: true } }),
    prisma.settlement.findMany({ where: { eventId }, include: { fromParticipant: true } }),
  ])

  // Seuls les règlements **confirmés** entrent dans le solde. Compter une déclaration
  // donnerait au débiteur le pouvoir d'effacer sa dette seul — exactement ce que les deux
  // états de §3.6 refusent.
  const confirmed = settlements.filter((settlement) => settlement.confirmedAt !== null)

  const raw = computeBalances({
    participantIds: participants.map((participant) => participant.id),
    expenses: expenses.map((expense) => ({
      paidBy: expense.paidBy,
      amountCents: expense.amountCents,
      shares: expense.shares.map((share) => ({
        participantId: share.participantId,
        amountCents: share.amountCents,
      })),
    })),
    settlements: confirmed,
  })

  const nameOf = new Map(participants.map((p) => [p.id, p.user.name]))

  return {
    balances: raw.map((balance) => ({
      participantId: balance.participantId,
      name: nameOf.get(balance.participantId) ?? 'Participant retiré',
      balanceCents: balance.balanceCents,
      you: balance.participantId === viewer.id,
    })),
    transfers: minimizeTransfers(raw).map((transfer) => ({
      ...transfer,
      fromName: nameOf.get(transfer.fromParticipantId) ?? '—',
      toName: nameOf.get(transfer.toParticipantId) ?? '—',
    })),
    pendingSettlements: settlements
      .filter((settlement) => settlement.confirmedAt === null)
      .map((settlement) => ({
        id: settlement.id,
        fromParticipantId: settlement.fromParticipantId,
        toParticipantId: settlement.toParticipantId,
        amountCents: settlement.amountCents,
        declaredAt: settlement.declaredAt,
      })),
  }
}
```

Route dans `events/routes.ts` :

```ts
  .get('/:id/balances', async (c) => {
    return c.json(await getBalances(c.get('user').id, c.req.param('id')))
  })
```

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- balances
```

Attendu : 3 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/modules/expenses/service.ts api/src/modules/events/routes.ts api/tests/modules/balances.test.ts
git commit -m "feat(api): derive balances and propose minimal transfers

Only confirmed settlements move a balance. Counting a declaration would let a
debtor clear their own debt alone, which is precisely what the two states of
§3.6 exist to prevent."
```

---

## Tâche 10 : déclarer, confirmer, retirer un règlement

**Fichiers :**
- Modifier : `api/src/modules/expenses/service.ts`
- Créer : `api/src/modules/settlements/routes.ts`
- Modifier : `api/src/modules/events/routes.ts`, `api/src/main.ts`
- Créer : `api/tests/modules/settlements.test.ts`

**Interfaces :**
- Produit : `declareSettlement(userId, eventId, input)`, `confirmSettlement(userId, settlementId)`,
  `withdrawSettlement(userId, settlementId)`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe('règlements', () => {
  beforeEach(resetDatabase)

  it('déclare puis confirme', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    const aliceId = await participantIdOf(eventId, alice)

    const declared = await app.request(`/api/events/${eventId}/settlements`, {
      method: 'POST',
      headers: { ...bob.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ toParticipantId: aliceId, amountCents: 500 }),
    })

    expect(declared.status).toBe(201)
    const { settlement } = await declared.json()
    expect(settlement.confirmedAt).toBeNull()

    const confirmed = await app.request(`/api/settlements/${settlement.id}/confirm`, {
      method: 'POST',
      headers: alice.headers,
    })

    expect(confirmed.status).toBe(200)
    expect((await confirmed.json()).settlement.confirmedAt).not.toBeNull()
  })

  it('refuse au débiteur de confirmer son propre virement', async () => {
    const { bob, settlementId } = await declaredSettlement()

    const response = await app.request(`/api/settlements/${settlementId}/confirm`, {
      method: 'POST',
      headers: bob.headers,
    })

    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('forbidden')
  })

  it('refuse de déclarer un virement au nom de quelqu\'un d\'autre', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const bob = await joinEvent(eventId, 'bob@example.test')
    const bobId = await participantIdOf(eventId, bob)

    const response = await app.request(`/api/events/${eventId}/settlements`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ toParticipantId: bobId, amountCents: 500, fromParticipantId: bobId }),
    })

    // `fromParticipantId` n'est pas un champ acceptable : le débiteur est toujours
    // l'appelant. Le corps supplémentaire est ignoré, et le virement part d'Alice.
    const { settlement } = await response.json()
    expect(settlement.fromParticipantId).toBe(await participantIdOf(eventId, alice))
  })

  it('laisse le débiteur retirer une déclaration non confirmée', async () => {
    const { bob, settlementId } = await declaredSettlement()

    const response = await app.request(`/api/settlements/${settlementId}`, {
      method: 'DELETE',
      headers: bob.headers,
    })

    expect(response.status).toBe(200)
  })

  it('refuse de retirer un règlement déjà confirmé', async () => {
    const { alice, bob, settlementId } = await declaredSettlement()
    await app.request(`/api/settlements/${settlementId}/confirm`, {
      method: 'POST',
      headers: alice.headers,
    })

    const response = await app.request(`/api/settlements/${settlementId}`, {
      method: 'DELETE',
      headers: bob.headers,
    })

    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('settlement_already_confirmed')
  })

  it('refuse un virement vers soi-même', async () => {
    const alice = await signIn('alice@example.test')
    const eventId = await createEvent(alice)
    const aliceId = await participantIdOf(eventId, alice)

    const response = await app.request(`/api/events/${eventId}/settlements`, {
      method: 'POST',
      headers: { ...alice.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ toParticipantId: aliceId, amountCents: 500 }),
    })

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('self_settlement')
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace api -- settlements
```

Attendu : échec, 404.

- [ ] **Étape 3 : écrire l'implémentation minimale**

```ts
// Un règlement est une **ligne indépendante** (§2.8 note 1) : il ne modifie aucune dépense
// et garde sa valeur si une dépense antérieure change. Deux états successifs, jamais un
// seul : le débiteur déclare, le créancier confirme (§3.6).
export async function declareSettlement(
  userId: string,
  eventId: string,
  input: DeclareSettlementInput,
) {
  const participant = await loadRecordingParticipant(userId, eventId)

  // Le débiteur est **toujours** l'appelant : on ne déclare pas un paiement au nom d'un
  // autre (§3.8).
  if (input.toParticipantId === participant.id) {
    throw new ApiError('self_settlement', 400, 'Un virement vers soi-même ne règle rien.')
  }

  const creditor = await prisma.eventParticipant.findFirst({
    where: { id: input.toParticipantId, eventId },
    select: { id: true },
  })

  if (creditor === null) {
    throw new ApiError('unknown_creditor', 400, 'Ce bénéficiaire ne participe pas à cet événement.')
  }

  const settlement = await prisma.settlement.create({
    data: {
      eventId,
      fromParticipantId: participant.id,
      toParticipantId: creditor.id,
      amountCents: input.amountCents,
    },
  })

  publish(eventId, { type: 'settlement.declared', id: settlement.id })

  return settlement
}

async function loadSettlement(settlementId: string) {
  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } })

  if (settlement === null) {
    throw new ApiError('settlement_not_found', 404, 'Règlement introuvable.')
  }

  return settlement
}

export async function confirmSettlement(userId: string, settlementId: string) {
  const settlement = await loadSettlement(settlementId)
  const participant = await loadParticipant(userId, settlement.eventId)

  if (!canConfirmSettlement(participant.id, settlement.toParticipantId)) {
    throw new ApiError('forbidden', 403, 'Seul le bénéficiaire peut confirmer avoir reçu ce virement.')
  }

  // Confirmer deux fois n'est pas une erreur : l'appel est idempotent, la première date fait
  // foi. Deux clics sur un réseau lent ne doivent pas produire un 409 incompréhensible.
  if (settlement.confirmedAt !== null) {
    return settlement
  }

  const confirmed = await prisma.settlement.update({
    where: { id: settlementId },
    data: { confirmedAt: new Date() },
  })

  publish(settlement.eventId, { type: 'settlement.confirmed', id: settlementId })

  return confirmed
}

// Retrait d'une déclaration erronée — mauvais destinataire, mauvais montant. Sans lui, la
// ligne resterait éternellement en attente et le créancier ne pourrait ni la confirmer ni
// la refuser : un état bloqué, que les règles du projet interdisent. Après confirmation, la
// ligne est définitive : un règlement est un fait, et se corrige par un règlement inverse.
export async function withdrawSettlement(userId: string, settlementId: string) {
  const settlement = await loadSettlement(settlementId)
  const participant = await loadParticipant(userId, settlement.eventId)

  if (!canDeclareSettlement(participant.id, settlement.fromParticipantId)) {
    throw new ApiError('forbidden', 403, 'Seul l\'émetteur peut retirer sa déclaration.')
  }

  if (settlement.confirmedAt !== null) {
    throw new ApiError(
      'settlement_already_confirmed',
      409,
      'Ce virement a été confirmé : corrigez-le par un virement inverse.',
    )
  }

  await prisma.settlement.delete({ where: { id: settlementId } })

  publish(settlement.eventId, { type: 'settlement.declared', id: settlementId })

  return { ok: true }
}
```

`api/src/modules/settlements/routes.ts` :

```ts
import { Hono } from 'hono'
import { requireSession, type SessionVariables } from '../../middleware/session.ts'
import { confirmSettlement, withdrawSettlement } from '../expenses/service.ts'

export const settlementsRoutes = new Hono<{ Variables: SessionVariables }>()
  .use('*', requireSession)
  .post('/:id/confirm', async (c) => {
    const settlement = await confirmSettlement(c.get('user').id, c.req.param('id'))
    return c.json({ settlement })
  })
  .delete('/:id', async (c) => {
    return c.json(await withdrawSettlement(c.get('user').id, c.req.param('id')))
  })
```

Route de déclaration dans `events/routes.ts`, montage dans `main.ts`.

- [ ] **Étape 4 : lancer le test et le voir passer**

```sh
npm test --workspace api -- settlements
```

Attendu : 6 tests passent.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add api/src/modules api/src/main.ts api/tests/modules/settlements.test.ts
git commit -m "feat(api): declare, confirm and withdraw a settlement

Withdrawal is not in §5.1 but a declaration made to the wrong person would
otherwise sit unconfirmable forever, and no state in this application is
allowed to be a dead end."
```

---

## Tâche 11 : onglet Dépenses côté front

**Fichiers :**
- Créer : `web/src/composables/useExpenses.ts`
- Créer : `web/src/components/ExpenseCard.vue`
- Modifier : `web/src/views/EventView.vue`
- Créer : `web/tests/expenses.test.ts`

**Interfaces :**
- Consomme : `apiFetch` de `web/src/lib/http.ts`.
- Produit : `useExpenses(eventId)` rendant
  `{ state, expenses, balances, transfers, pendingSettlements, error, reload, record, declare, confirm, withdraw }`.

- [ ] **Étape 1 : écrire le test qui échoue**

`onMounted` ne se déclenche pas hors composant : comme dans `web/tests/activities.test.ts`,
le composable est appelé directement et `reload()` explicitement — ne pas introduire de
`withSetup`, le projet n'en a pas.

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { useExpenses } from '../src/composables/useExpenses.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const expense = {
  id: 'x1',
  label: 'Taxi',
  amountCents: 1000,
  currency: 'EUR',
  activityId: null,
  splitMode: 'equal',
  createdAt: '2026-10-01T18:00:00.000Z',
  paidBy: { participantId: 'p1', name: 'Alice' },
  shares: [
    { participantId: 'p1', amountCents: 500 },
    { participantId: 'p2', amountCents: 500 },
  ],
}

const balanceBody = {
  balances: [
    { participantId: 'p1', name: 'Alice', balanceCents: 500, you: true },
    { participantId: 'p2', name: 'Bob', balanceCents: -500, you: false },
  ],
  transfers: [
    {
      fromParticipantId: 'p2',
      toParticipantId: 'p1',
      amountCents: 500,
      fromName: 'Bob',
      toName: 'Alice',
    },
  ],
  pendingSettlements: [],
}

const route = (url: string) => (url.endsWith('/expenses') ? json({ expenses: [expense] }) : json(balanceBody))

it('charge dépenses et soldes en une passe', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => route(url)),
  )

  const { state, expenses, balances, transfers, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('ready')
  expect(expenses.value).toHaveLength(1)
  expect(balances.value).toHaveLength(2)
  expect(transfers.value).toHaveLength(1)
})

it('passe à « empty » sans dépense, en gardant les soldes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/expenses')
        ? json({ expenses: [] })
        : json({ balances: [], transfers: [], pendingSettlements: [] }),
    ),
  )

  const { state, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('empty')
})

it('recharge après une saisie', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ id: 'x2' }, 201)
    return route(url)
  })
  vi.stubGlobal('fetch', fetchMock)

  const { record } = useExpenses('e1')
  await record({ label: 'Musée', amountCents: 600 })

  // Une saisie, puis les deux lectures du rechargement : la dépense et les soldes ne
  // peuvent pas diverger à l'écran.
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('passe en erreur quand le chargement échoue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({ code: 'not_a_participant', message: 'Vous ne participez pas.', details: {} }, 403),
    ),
  )

  const { state, error, reload } = useExpenses('e1')
  await reload()

  expect(state.value).toBe('error')
  expect(error.value).toBe('Vous ne participez pas.')
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace web -- expenses
```

Attendu : échec, module introuvable.

- [ ] **Étape 3 : écrire le composable**

```ts
import { onMounted, ref } from 'vue'
import { apiFetch } from '../lib/http'

export type Expense = {
  id: string
  label: string
  amountCents: number
  currency: string
  activityId: string | null
  splitMode: 'equal' | 'percent' | 'fixed'
  createdAt: string
  paidBy: { participantId: string; name: string }
  shares: { participantId: string; amountCents: number }[]
}

export type Balance = {
  participantId: string
  name: string
  balanceCents: number
  you: boolean
}

export type Transfer = {
  fromParticipantId: string
  toParticipantId: string
  amountCents: number
  fromName: string
  toName: string
}

export type PendingSettlement = {
  id: string
  fromParticipantId: string
  toParticipantId: string
  amountCents: number
  declaredAt: string
}

// Dépenses et soldes d'un événement. Les deux voyagent ensemble : une dépense saisie change
// un solde, et afficher l'un sans l'autre laisserait la moitié de l'écran périmée.
export function useExpenses(eventId: string) {
  const state = ref<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const expenses = ref<Expense[]>([])
  const balances = ref<Balance[]>([])
  const transfers = ref<Transfer[]>([])
  const pendingSettlements = ref<PendingSettlement[]>([])
  const error = ref('')

  async function reload(): Promise<void> {
    try {
      const [expenseBody, balanceBody] = await Promise.all([
        apiFetch<{ expenses: Expense[] }>(`/api/events/${eventId}/expenses`),
        apiFetch<{
          balances: Balance[]
          transfers: Transfer[]
          pendingSettlements: PendingSettlement[]
        }>(`/api/events/${eventId}/balances`),
      ])

      expenses.value = expenseBody.expenses
      balances.value = balanceBody.balances
      transfers.value = balanceBody.transfers
      pendingSettlements.value = balanceBody.pendingSettlements
      state.value = expenseBody.expenses.length === 0 ? 'empty' : 'ready'
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Chargement impossible.'
      state.value = 'error'
    }
  }

  async function record(input: { label: string; amountCents: number }): Promise<void> {
    await apiFetch(`/api/events/${eventId}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ ...input, splitMode: 'equal' }),
    })
    await reload()
  }

  async function declare(toParticipantId: string, amountCents: number): Promise<void> {
    await apiFetch(`/api/events/${eventId}/settlements`, {
      method: 'POST',
      body: JSON.stringify({ toParticipantId, amountCents }),
    })
    await reload()
  }

  async function confirm(settlementId: string): Promise<void> {
    await apiFetch(`/api/settlements/${settlementId}/confirm`, { method: 'POST' })
    await reload()
  }

  async function withdraw(settlementId: string): Promise<void> {
    await apiFetch(`/api/settlements/${settlementId}`, { method: 'DELETE' })
    await reload()
  }

  onMounted(reload)

  return {
    state,
    expenses,
    balances,
    transfers,
    pendingSettlements,
    error,
    reload,
    record,
    declare,
    confirm,
    withdraw,
  }
}
```

- [ ] **Étape 4 : écrire l'affichage des montants**

`web/src/lib/money.ts` — le pendant front de `lib/dates.ts` :

```ts
// Les centimes ne deviennent des euros qu'ici, au dernier moment, pour l'œil humain. Aucun
// calcul n'est fait sur le résultat : le domaine financier reste entier côté API.
export function formatCents(amountCents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amountCents / 100)
}
```

Créer `web/src/components/ExpenseCard.vue` sur le modèle d'`ActivityCard.vue` : libellé,
montant formaté, qui a avancé, nombre de parts.

- [ ] **Étape 5 : brancher l'onglet**

Dans `web/src/views/EventView.vue`, remplacer

```html
<span class="pb-2 text-neutral-400">Dépenses · à venir</span>
```

par un troisième bouton d'onglet identique aux deux autres, et ajouter la section
`v-if="tab === 'depenses'"` : liste des `ExpenseCard`, formulaire de saisie réservé à
`hasAccepted`, et `BalanceSheet` (tâche 12).

Le champ de saisie du montant est en **euros** pour l'utilisateur et converti en centimes à
l'envoi :

```ts
// `Math.round` et non `Math.trunc` : « 10,99 » saisi en euros vaut 1098.9999… en flottant,
// et tronquer perdrait un centime à chaque dépense.
const amountCents = Math.round(Number(amountEuros.value.replace(',', '.')) * 100)
```

- [ ] **Étape 6 : lancer le test et le voir passer**

```sh
npm test --workspace web -- expenses
```

- [ ] **Étape 7 : portes puis commit**

Rappel : **ne pas** lancer la correction automatique de Biome sur les `.vue`.

```sh
npx biome check --write . && npm run typecheck && npm test
git add web/src web/tests/expenses.test.ts
git commit -m "feat(web): record an expense and read the tab

Euros are rounded, not truncated, on their way to cents: 10,99 is 1098.9999 in
floating point and truncating would drop a cent on every single expense."
```

---

## Tâche 12 : soldes, virements et règlements côté front

**Fichiers :**
- Créer : `web/src/components/BalanceSheet.vue`
- Modifier : `web/src/composables/useEventStream.ts`
- Modifier : `web/src/views/EventView.vue`
- Créer : `web/tests/balances.test.ts`

**Interfaces :**
- Consomme : `useExpenses` de la tâche 11.
- Produit : `BalanceSheet` recevant `balances`, `transfers`, `pendingSettlements`, `viewerId`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
describe('BalanceSheet', () => {
  it('propose au débiteur de déclarer son virement', async () => {
    const wrapper = mount(BalanceSheet, {
      props: {
        balances: [
          { participantId: 'p1', name: 'Alice', balanceCents: 500, you: false },
          { participantId: 'p2', name: 'Bob', balanceCents: -500, you: true },
        ],
        transfers: [
          {
            fromParticipantId: 'p2',
            toParticipantId: 'p1',
            amountCents: 500,
            fromName: 'Bob',
            toName: 'Alice',
          },
        ],
        pendingSettlements: [],
        viewerId: 'p2',
      },
    })

    expect(wrapper.text()).toContain("J'ai envoyé")
  })

  it('propose au créancier de confirmer une déclaration reçue', async () => {
    const wrapper = mount(BalanceSheet, {
      props: {
        balances: [
          { participantId: 'p1', name: 'Alice', balanceCents: 500, you: true },
          { participantId: 'p2', name: 'Bob', balanceCents: -500, you: false },
        ],
        transfers: [],
        pendingSettlements: [
          {
            id: 's1',
            fromParticipantId: 'p2',
            toParticipantId: 'p1',
            amountCents: 500,
            declaredAt: '2026-10-01T20:00:00.000Z',
          },
        ],
        viewerId: 'p1',
      },
    })

    expect(wrapper.text()).toContain("J'ai reçu")
    expect(wrapper.text()).not.toContain('Retirer')
  })

  it('propose au débiteur de retirer sa déclaration, pas de la confirmer', async () => {
    const wrapper = mount(BalanceSheet, {
      props: {
        balances: [],
        transfers: [],
        pendingSettlements: [
          {
            id: 's1',
            fromParticipantId: 'p2',
            toParticipantId: 'p1',
            amountCents: 500,
            declaredAt: '2026-10-01T20:00:00.000Z',
          },
        ],
        viewerId: 'p2',
      },
    })

    expect(wrapper.text()).toContain('Retirer')
    expect(wrapper.text()).not.toContain("J'ai reçu")
  })

  it("n'offre aucun bouton à un tiers", async () => {
    const wrapper = mount(BalanceSheet, {
      props: {
        balances: [
          { participantId: 'p1', name: 'Alice', balanceCents: 500, you: false },
          { participantId: 'p2', name: 'Bob', balanceCents: -500, you: false },
        ],
        transfers: [
          {
            fromParticipantId: 'p2',
            toParticipantId: 'p1',
            amountCents: 500,
            fromName: 'Bob',
            toName: 'Alice',
          },
        ],
        pendingSettlements: [
          {
            id: 's1',
            fromParticipantId: 'p2',
            toParticipantId: 'p1',
            amountCents: 500,
            declaredAt: '2026-10-01T20:00:00.000Z',
          },
        ],
        viewerId: 'p3',
      },
    })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
```

- [ ] **Étape 2 : lancer le test et le voir échouer**

```sh
npm test --workspace web -- balances
```

- [ ] **Étape 3 : écrire le composant**

`BalanceSheet.vue` affiche trois blocs :

1. **Soldes** — une ligne par participant, montant formaté, vert au-dessus de zéro, rouge
   en dessous, « vous » mis en évidence.
2. **Virements proposés** — « Bob doit 5,00 € à Alice ». Le bouton « J'ai envoyé » n'apparaît
   que sur les lignes dont l'appelant est le débiteur : déclarer est réservé au débiteur
   (§3.8), et afficher un bouton qui répondrait 403 serait un mensonge d'interface.
3. **En attente de confirmation** — bouton « J'ai reçu » pour le créancier, « Retirer » pour
   le débiteur.

- [ ] **Étape 4 : brancher le flux temps réel**

Dans `useEventStream.ts`, ajouter la famille financière :

```ts
// Les quatre messages financiers déclenchent le même rechargement ciblé : dépenses et
// soldes voyagent ensemble, un règlement confirmé bouge les deux.
const EXPENSE_TYPES = [
  'expense.created',
  'expense.updated',
  'settlement.declared',
  'settlement.confirmed',
] as const
```

avec un `onExpenseChange` dans `Handlers`, câblé dans `EventView.vue` sur
`reloadExpenses`. **C'est ce qui fait la démonstration** : un règlement confirmé sur un
téléphone efface la dette sur l'écran d'en face, sans rechargement.

- [ ] **Étape 5 : lancer le test et le voir passer**

```sh
npm test --workspace web -- balances
```

- [ ] **Étape 6 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add web/src web/tests/balances.test.ts
git commit -m "feat(web): show balances and settle up in real time

The declare button only appears on rows where the viewer is the debtor: showing
one that would answer 403 is an interface that lies."
```

---

## Tâche 13 : documentation et dette reprise

**Fichiers :**
- Modifier : `docs/journal-decisions.md`, `docs/conception.md`, `CLAUDE.md`, `README.md`
- Modifier : `web/tests/activities.test.ts`

- [ ] **Étape 1 : consigner les six décisions**

Reporter dans `docs/journal-decisions.md` les six décisions listées plus haut, chacune avec
son motif et son coût.

- [ ] **Étape 2 : corriger la surface HTTP de la conception**

`docs/conception.md` §5.1 — ajouter les trois routes décidées ici :

```txt
GET    /events/:id/expenses        dépenses de l'événement
DELETE /settlements/:id            retrait d'une déclaration non confirmée
GET    /activities/:id/attendance  présents à une activité
```

- [ ] **Étape 3 : mettre à jour l'état du projet**

`CLAUDE.md` — section « État actuel » : M3 terminé, M4 (groupes, calendrier partagé) suivant.
Rappeler que le déploiement reste dû depuis M1.

`README.md` — la démonstration du jalon : saisir deux dépenses, ouvrir les soldes, exécuter
les virements proposés.

- [ ] **Étape 4 : reprendre l'avertissement Biome laissé par M2**

`web/tests/activities.test.ts:65` — le paramètre `url` de la doublure `fetch` est inutilisé :

```ts
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
```

C'est un fichier `.ts`, pas un `.vue` : la correction automatique de Biome est sans danger.

- [ ] **Étape 5 : portes puis commit**

```sh
npx biome check --write . && npm run typecheck && npm test
git add docs CLAUDE.md README.md web/tests/activities.test.ts
git commit -m "docs: record the M3 additions to the HTTP surface

Three routes decided during this milestone are missing from §5.1. A document
that lies is worse than no document, so the specification moves with the code."
```

---

## Vérification finale du jalon

- [ ] `npx biome check .` — aucun avertissement, y compris celui repris de M2
- [ ] `npm run typecheck` — les deux espaces
- [ ] `npm test` — api et web
- [ ] `npm run build`
- [ ] `npm run db:seed` puis démonstration manuelle à deux navigateurs :
  1. Alice crée un événement, invite Bob et Carol, tous acceptent
  2. Alice saisit « Restaurant, 90 € », Bob saisit « Taxi, 30 € »
  3. L'onglet **Dépenses** de Carol montre les deux dépenses **sans rechargement**
  4. Les soldes affichent +60 / +10 / −70 et **deux** virements proposés, pas trois
  5. Carol déclare son virement à Alice ; l'écran d'Alice montre « en attente » en direct
  6. Alice confirme ; les deux soldes tombent à zéro sur les deux écrans

**Invariants à vérifier à la main en base après la démonstration :**

```sql
-- Doit rendre zéro ligne : chaque dépense est exactement couverte par ses parts.
SELECT e.id
FROM expenses e
JOIN expense_shares s ON s.expense_id = e.id
GROUP BY e.id, e.amount_cents
HAVING SUM(s.amount_cents) <> e.amount_cents;
```

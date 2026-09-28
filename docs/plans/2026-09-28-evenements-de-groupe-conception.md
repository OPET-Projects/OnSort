# Événements de groupe — conception

**But :** qu'un événement puisse naître dans un groupe, et que les membres de ce groupe y
soient invités d'office, y compris ceux qui arrivent après coup. C'est la suite que le
calendrier partagé de M4 appelait : on trouve un créneau libre, on en fait une sortie.

**Conception de référence :** [`../conception.md`](../conception.md) §2.3, §2.5, §3.2, §5.1.
**Fait autorité** ; ce document la complète et la corrige dans le même commit que le code.

## Décisions

| Question | Choix | Écarté, et pourquoi |
| --- | --- | --- |
| Que deviennent les membres à la création ? | Invités d'office : une participation `member/invited` chacun, et une notification `event.invited` | Adhésion libre sans invitation : l'événement passerait inaperçu. Simple étiquette : le groupe n'apporterait rien |
| Un membre qui arrive après la création ? | Ajouté d'office, en `invited`, aux événements du groupe **pas encore commencés** (`starts_at > maintenant`) | Tous les événements : l'inscrire à une sortie passée n'a pas de sens |
| Qui crée un événement de groupe ? | Tout membre du groupe. Il en devient administrateur ; les administrateurs du groupe n'ont aucun droit particulier sur l'événement | Deux sources de droits à tenir cohérentes |
| Par où ? | Depuis le groupe (créneau libre ou bouton) **et** par un sélecteur dans le formulaire de création. Venu d'un groupe, le formulaire n'affiche pas le sélecteur | — |
| Le groupe change-t-il ? | Non : fixé à la création, ni rattachement ni détachement ultérieurs | Détacher poserait la question du sort des participants |
| Participation matérialisée ou calculée ? | Matérialisée à l'écriture | Calculée depuis l'adhésion : dépenses, soldes et votes sont tous indexés par `event_participants.id` |

La réponse d'invitation reste libre : être invité d'office ne vaut pas acceptation. La règle
de M4 — on ne rejoint jamais sans l'avoir accepté — est tenue, puisque l'adhésion au groupe
a elle-même été acceptée et que l'événement se décline.

## Données

Une migration, écrite à la main :

- clé étrangère `events.group_id → groups.id`, `ON DELETE SET NULL`. Aucun geste ne
  supprime encore un groupe ; le jour où il existera, ses événements survivront en ad hoc,
  dépenses intactes ;
- relation Prisma `Event.group` / `Group.events`.

Aucune table nouvelle.

## Règles

**Création.** `POST /events` accepte un `groupId` facultatif. L'appelant doit être membre du
groupe — 404 `group_not_found` si le groupe n'existe pas, 403 `not_a_member` sinon. Dans une
transaction : l'événement, le créateur en `admin/accepted`, chaque autre membre en
`member/invited`. Puis, hors transaction, `event.invited` aux membres ajoutés.

**Arrivée dans le groupe.** `joinGroup` est le point de passage unique des trois canaux
d'invitation. Après l'adhésion, il crée une participation `member/invited` pour chaque
événement du groupe dont `starts_at > maintenant`, par `upsert` sur `(event_id, user_id)` :
un participant existant garde rôle et réponse. Puis `event.invited` pour chaque événement,
et une publication sur le flux de chacun, pour que la liste des participants se mette à
jour sans rechargement.

**Course.** Une création et une arrivée simultanées pourraient chacune ignorer l'écriture
non validée de l'autre, et laisser le nouveau membre hors de l'événement. Les deux
transactions verrouillent la ligne `groups` (`SELECT … FOR UPDATE`) avant de lire : elles
passent l'une après l'autre, et la seconde voit la première.

**Invariants.** `PATCH /events/:id` ne touche pas au groupe. Les parts de dépense déjà
saisies restent figées : l'arrivée d'un membre ne les modifie pas.

## API

| Route | Changement |
| --- | --- |
| `POST /events` | `groupId` facultatif (uuid) |
| `GET /events` | `groupName`, ou `null`, par ligne |
| `GET /events/:id` | `group: { id, name } \| null` |
| `GET /groups/:id` | `events` : `id, title, startsAt, endsAt, status` et la `rsvp` de l'appelant, triés par date |

Pas de pagination sur `events` d'un groupe : le volume d'un groupe d'amis ne la justifie
pas. Choix non mesuré, consigné comme tel.

Erreurs : forme uniforme `{ code, message, details }`, aucun code nouveau.

## Interface

- **`EventCreateView`.** Sans contexte : sélecteur « Groupe » — « Aucun (sortie ad hoc) » et
  les groupes de l'appelant (`GET /groups`) — avec une ligne rappelant que tous les membres
  seront invités. Avec `?group=<id>` : pas de sélecteur, le nom du groupe en rappel fixe.
  `?startsAt=&endsAt=` pré-remplissent les dates.
- **`GroupView`.** Bouton « Nouvelle sortie » vers `/events/new?group=<id>` ; chaque créneau
  libre mène au même formulaire, dates pré-remplies ; section « Sorties du groupe » avec la
  date et la réponse de l'appelant.
- **`EventView`.** Le groupe d'origine, avec un lien.
- **`HomeView`.** Le nom du groupe en sous-titre d'une sortie de groupe.

## Tests

API, en TDD :

- création dans un groupe : autres membres `member/invited`, créateur `admin/accepted` ;
- non-membre refusé (403), groupe inconnu (404), aucune ligne créée ;
- arrivée : ajout aux événements futurs, ni aux passés ni aux commencés ;
- arrivée répétée idempotente, participant existant inchangé ;
- `event.invited` émis au bon ensemble d'utilisateurs ;
- `GET /groups/:id`, `GET /events/:id`, `GET /events` exposent les nouveaux champs ;
- parts d'une dépense antérieure intactes après une arrivée ;
- course : création et adhésion en parallèle finissent toujours avec le membre inscrit.
  Test probabiliste ; on vérifie une fois qu'il échoue sans le verrou.

Web : construction du lien pré-rempli depuis un créneau, lecture des paramètres de requête
du formulaire.

## Hors périmètre

Quitter un groupe, en retirer un membre, le renommer : chantier suivant. Il devra trancher
le sort des participations d'un membre qui part.

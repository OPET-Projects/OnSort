# Membres d'un groupe, retrait et blocage d'amis — conception

**But :** fermer deux points laissés ouverts du journal. Un groupe se renomme, se quitte, et
ses administrateurs gèrent ses membres. Une amitié se retire, et une personne se bloque.

**Conception de référence :** [`../conception.md`](../conception.md) §2.2, §2.3, §3.1, §4, §5.1.
**Fait autorité** ; ce document la complète dans le même commit que le code.

Deux branches, tirées de `feature` : `feat/group-members` et `feat/friend-removal`. Elles ne
partagent aucun fichier de code.

## A. Membres d'un groupe

### Décisions

| Question | Choix | Écarté, et pourquoi |
| --- | --- | --- |
| Le dernier admin part, des membres restent | Le membre le plus ancien (`joined_at`) est promu | Refuser le départ : l'admin qui veut partir serait coincé — un état absorbant |
| Le dernier membre part | Le groupe est supprimé ; ses sorties deviennent ad hoc (`ON DELETE SET NULL`) | Garder un groupe vide : invisible de tous, donc inatteignable |
| Participations aux sorties de qui part | Intactes : quitter le groupe ne quitte pas les sorties | Retirer les invitations : une participation peut porter des parts figées |
| Rôles | Un admin promeut et rétrograde ; on ne rétrograde pas le dernier admin | — |
| Notifications | Aucune nouvelle : les dix types de §2.9 restent la liste | Un type « retiré du groupe » : utile, mais hors du besoin exprimé |

### API

| Route | Qui | Effet |
| --- | --- | --- |
| `PATCH /groups/:id` `{ name }` | admin | Renomme. Même validation que la création |
| `PATCH /groups/:id/members/:userId` `{ role }` | admin | `admin` ou `member`. Rétrograder le dernier admin : 409 `last_admin` |
| `DELETE /groups/:id/members/:userId` | l'intéressé, ou un admin | `userId` = appelant : **quitter**. Sinon : **retirer**, réservé à un admin |

Erreurs, forme uniforme : 404 `group_not_found`, 403 `not_a_member` pour un non-membre,
403 `forbidden` pour un membre sans les droits, 404 `member_not_found` pour une cible qui
n'est pas membre, 409 `last_admin`.

Réponses : `PATCH` rend `{ ok: true }` ; `DELETE` rend `{ groupDeleted: boolean }`, pour que
l'interface sache où renvoyer.

### Départ, sous verrou

Quitter et retirer passent par une même fonction, dans une transaction qui prend
`lockGroup` : supprimer l'adhésion ; s'il ne reste personne, supprimer le groupe ; sinon,
s'il ne reste aucun admin, promouvoir le plus ancien. Le verrou ordonne ce départ face à une
création de sortie, une arrivée, ou un autre départ simultané — deux admins qui partent
ensemble ne doivent pas laisser un groupe sans admin.

Rétrograder prend le même verrou, pour la même raison : deux admins qui se rétrogradent
mutuellement en même temps.

### Interface — fiche du groupe

- Admin : un bouton « Renommer » dans l'en-tête ouvre un champ en place.
- Admin, sur chaque autre membre : « Promouvoir » ou « Rétrograder », et « Retirer » avec
  confirmation.
- Tous : « Quitter le groupe » en bas de page, avec confirmation. Au retour, `/groups`.

## B. Retrait et blocage d'amis

### Décisions

| Question | Choix | Écarté, et pourquoi |
| --- | --- | --- |
| Retirer un ami | Supprime l'amitié ; une nouvelle demande reste possible | — |
| Bloquer | Supprime l'amitié et les demandes en attente dans les deux sens | — |
| Demande d'ami entre deux personnes dont l'une bloque l'autre | Réponse habituelle, rien de créé, personne de notifié | Un refus explicite : il dirait au bloqué qu'il l'est |
| Portée du blocage | Les demandes d'ami seulement | Groupes et sorties : chantier à part, noté au journal |

### Données

Une migration, écrite à la main :

```sql
user_blocks(
  blocker_id, blocked_id, created_at,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
)
```

Clés étrangères vers `user`, `ON DELETE CASCADE`. `api/tests/helpers/db.ts` gagne la table.

### API

| Route | Effet |
| --- | --- |
| `DELETE /friends/:userId` | Retire l'amitié. 404 `friendship_not_found` si l'appelant n'est pas ami avec lui |
| `POST /friends/blocks/:userId` | Bloque. Idempotent. 404 `user_not_found`, 400 `self_block` |
| `DELETE /friends/blocks/:userId` | Débloque. Idempotent |
| `GET /friends` | Gagne `blocked: [{ userId, name }]` |

Un 404 sur un identifiant d'utilisateur n'est pas un oracle : les identifiants sont opaques,
et l'appelant ne les tient que d'une liste qu'on lui a déjà montrée. L'anti-énumération
porte sur les adresses, que ces routes ne prennent pas.

### Interface — écran Amis

- Sur un ami : « Retirer », « Bloquer », chacun avec confirmation.
- Sur une demande reçue : « Bloquer » à côté d'Accepter et Refuser.
- Section « Bloqués », masquée si vide, avec « Débloquer ».

## Tests

API, en TDD. Groupe : renommer (admin, refus membre) ; promouvoir, rétrograder, 409 sur le
dernier admin ; quitter ; retirer (admin, refus membre, 404 non-membre) ; promotion
automatique du plus ancien ; suppression au départ du dernier membre, sorties conservées en
ad hoc ; participations intactes ; départs simultanés de deux admins laissent un admin.

Amis : retirer ; 404 sans amitié ; bloquer supprime amitié et demandes des deux sens ;
demande silencieuse dans les deux sens pendant un blocage, sans notification ; débloquer
rend la demande possible ; `GET /friends` expose les bloqués ; idempotence ; `self_block`.

Web : aucune logique pure nouvelle ; typage, construction et vérification à l'écran.

## Hors périmètre

Notifier un membre retiré ; bloquer les invitations de groupe ou de sortie ; transférer la
création d'un groupe.

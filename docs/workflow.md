# Comment on travaille

Ce document décrit la méthode. Il s'adresse autant à un membre de l'équipe qu'à un agent qui
reprendrait le projet sur une autre machine.

## Découpage en jalons

Le travail avance par jalons numérotés, décrits en section 9 de
[`conception.md`](conception.md). Le principe qui les gouverne : **chaque jalon laisse une
application démontrable**. On ne découpe pas en couches horizontales — toute la base, puis
toute l'API, puis toute l'interface — parce qu'un tel découpage ne produit rien de montrable
avant la fin.

| Jalon | Contenu | Démonstration |
|---|---|---|
| M0 | Socle, authentification | Je me connecte — **terminé** |
| M1 | Événement, invitations, participants | Un tiers rejoint depuis son téléphone |
| M2 | Activités, vote, temps réel | Le décompte bouge en direct sur deux écrans |
| M3 | Dépenses, soldes, virements minimisés | Quatre virements au lieu de dix |
| M4 | Groupes, calendrier partagé | Le créneau qui convient à tous |
| M5 | Carte, géocodage | Le programme sur une carte |
| M6 | Amis, notifications | |
| M7 | Finitions | |

À l'issue de M3, le produit est cohérent et se défend seul. Les jalons suivants s'ajoutent
dans l'ordre du temps restant.

**Une migration par jalon.** On ne crée pas aujourd'hui des tables que personne n'écrit
encore. M0 ne contient que les quatre tables d'authentification, et c'est volontaire.

## Un jalon, un plan

Avant d'écrire du code, le jalon est décrit dans un plan déposé dans
[`plans/`](plans/). Le plan de M0 y figure et sert de modèle.

Un plan utile contient, pour chaque tâche : les fichiers touchés, les interfaces produites et
consommées, le code à écrire, la commande de test exacte à lancer et le résultat attendu. Il
suppose que celui qui l'exécute ne connaît pas le projet.

Ce qu'un plan ne doit **jamais** contenir : « TODO », « à compléter », « ajouter la gestion
d'erreur appropriée », ou « comme la tâche précédente ». Une consigne qu'il faut interpréter
sera mal interprétée.

## Développement piloté par les tests

Pour chaque tâche, dans cet ordre, sans en sauter :

1. écrire le test ;
2. le lancer et **constater qu'il échoue** ;
3. écrire le minimum qui le fait passer ;
4. le relancer et constater qu'il passe ;
5. commiter.

L'étape 2 n'est pas décorative : un test qui n'a jamais échoué ne prouve pas qu'il teste
quelque chose.

### Ce qui compte dans un test

Un test qui n'affirme rien, qui vérifie l'implémentation plutôt que le comportement, ou qui
passerait quelle que soit l'implémentation, est un défaut — pas une couverture.

L'effort porte en priorité sur les fonctions pures, sans entrées-sorties : arithmétique des
montants, décompte des votes, permissions. Ce sont elles qui portent le risque réel. La
tuyauterie CRUD n'a pas besoin d'être couverte pour le plaisir du chiffre.

Les tests d'intégration s'exécutent contre un vrai PostgreSQL, avec la base vidée avant
**chaque** test. Un test qui dépend de l'ordre d'exécution est cassé, même s'il passe.

## Portes de vérification

Avant chaque commit :

```sh
npx biome check --write .
npm run typecheck
npm test
```

Ce sont exactement les commandes de la CI. **Le typage est une porte à part entière** : sur ce
projet, il est resté cassé pendant cinq tâches parce que seuls les tests étaient lancés.

## Relecture

Chaque tâche est relue avant d'être considérée comme finie, sur deux axes séparés :

- **conformité** — le livrable fait ce que le plan demandait, ni moins, ni plus. Un ajout non
  réclamé est un défaut, pas un bonus ;
- **qualité** — correction, cas limites, sécurité, qualité des tests.

Les constats sont classés Critique, Important ou Mineur. Les deux premiers se corrigent avant
de passer à la suite ; les mineurs sont consignés et triés à la fin du jalon.

Un relecteur ne doit jamais se voir dire à l'avance quoi ne pas signaler.

## Décisions

Quand une décision est prise en cours de route — souvent contre ce que le plan disait — elle
est consignée dans [`journal-decisions.md`](journal-decisions.md) avec trois éléments : ce qui
a été décidé, pourquoi, et **ce que ça coûte si la décision est mauvaise**.

Ce troisième élément est le plus utile. Il permet de rouvrir une décision sans rejouer tout le
raisonnement, et il oblige à mesurer l'enjeu avant de trancher. Une décision de ce journal
s'est d'ailleurs révélée fausse et a été annulée : c'est le fonctionnement attendu.

## Commits

Conventional Commits, en anglais. Le corps explique **pourquoi**, jamais **quoi** : le diff dit
déjà quoi.

Un commit par nature de changement. Une correction d'environnement et une fonctionnalité ne
partagent pas le même commit, même si elles ont été faites dans la même heure.

**Aucune ligne d'attribution** : ni `Co-Authored-By`, ni mention d'un agent ou de son éditeur,
ni emoji, ni lien de session. Le message se termine sur sa dernière ligne de contenu.

## Branches

Une branche par jalon, nommée `feat/<jalon>`. La CI s'exécute sur les pull requests et sur les
poussées vers `main`.

N'ouvre pas de pull request sans qu'on te l'ait demandé.

## Documentation

Un document qui contredit le code est pire que pas de document. Quand une décision change,
le document concerné est corrigé **dans le même commit que le code**.

La hiérarchie d'autorité entre documents est décrite dans [`../CLAUDE.md`](../CLAUDE.md).

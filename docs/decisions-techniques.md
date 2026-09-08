# Décisions techniques et produit

Ce document consigne les arbitrages faits avant l'écriture du code : les options envisagées,
celles qui ont été écartées, et les raisons. Il sert de mémoire de projet et de base à la
justification orale des choix.

Dernière mise à jour : 8 septembre 2026.

---

## 1. Contexte

« On Sort ? » est un projet de cours. Le VPS est fourni par l'intervenant. Le produit n'a pas
vocation à supporter une mise en production à grande échelle. Les arbitrages ci-dessous
privilégient donc, dans l'ordre : la livraison dans les délais, la démontrabilité, la
qualité de modélisation, puis seulement la robustesse d'exploitation.

Plusieurs recommandations issues d'une analyse « produit grand public » ont été
explicitement retirées pour cette raison. Elles sont conservées en section 6 au cas où le
projet dépasserait le cadre du cours.

---

## 2. Décisions techniques

### 2.1 Front — Vue 3 + Vite + TypeScript, en SPA

Le référencement n'a aucun intérêt pour une application dont tout le contenu est derrière
une authentification. Une SPA suffit, et se marie bien avec une API séparée.

Nuxt a été envisagé : il aurait apporté des routes serveur et un déploiement natif sur
Vercel. Ce bénéfice disparaît dès lors que le déploiement se fait sur un VPS.

### 2.2 Back — Deno 2 + Hono

**Trajectoire de la décision** : Go → TypeScript hors Node → Deno.

Go a été écarté après analyse : pour une application de type CRUD à formulaires, il
représente environ deux à trois fois plus de code que l'équivalent TypeScript, impose deux
systèmes de types de part et d'autre de la frontière HTTP, et deux couches de validation
distinctes. Ses avantages réels (binaire unique, faible empreinte mémoire) ne compensent pas
ce coût sur un projet de cette taille.

Deno apporte TypeScript nativement sans étape de build, un bac à sable de permissions, et
`fmt` / `lint` / `test` / `task` intégrés — soit un nombre réduit de dépendances de
développement à maintenir. Sa contrepartie est un écosystème plus restreint que Node.

**Hono** est retenu comme framework HTTP pour trois raisons : support Deno natif, empreinte
minimale, et surtout **Hono RPC**, qui expose le type du routeur serveur au client. Le front
importe ce type et obtient un client entièrement typé, sans génération de code ni contrat
OpenAPI à maintenir. C'est le principal bénéfice du choix de TypeScript des deux côtés ; ne
pas l'exploiter reviendrait à perdre la robustesse de Go sans contrepartie.

Alternatives écartées : Oak (natif Deno, mais pas de client typé), Fresh (basé sur Preact,
incompatible avec le choix de Vue).

### 2.3 Base de données — PostgreSQL 17

La requête centrale du produit est un calcul d'intersection de créneaux entre les
indisponibilités des membres d'un groupe. PostgreSQL la traite nativement :

```sql
CREATE EXTENSION btree_gist;

unavailability (
  id, user_id, period tstzrange,
  EXCLUDE USING gist (user_id WITH =, period WITH &&)
)
```

Le type `tstzrange` associé à un index GiST donne la recherche de chevauchement, et la
contrainte d'exclusion empêche par construction qu'un utilisateur saisisse deux
indisponibilités qui se recoupent — la normalisation est déléguée à la base plutôt que
codée dans l'application.

Les montants sont stockés en **entiers, en centimes**. Aucun flottant ne doit apparaître
dans le domaine financier.

Un champ `currency` est prévu dès le schéma initial bien que seul l'euro soit supporté :
le coût est nul maintenant, celui d'une migration ultérieure ne l'est pas.

### 2.4 Accès aux données — Drizzle ORM

**Prisma a été écarté.** Motif décisif : Prisma ne supporte pas les types range de
PostgreSQL. Toutes les requêtes de disponibilité — c'est-à-dire le cœur du produit —
devraient passer par `$queryRaw` ou TypedSQL, hors du modèle. On paierait l'ORM sans en
bénéficier là où le problème est difficile.

Drizzle permet de déclarer `tstzrange` via `customType`, gère les migrations, et offre une
échappatoire SQL propre (``db.execute(sql`…`)``) pour les requêtes de créneau.

Kysely était une alternative crédible — meilleure affinité avec le SQL brut — mais son
support des migrations demande un outillage supplémentaire.

Note historique : Prisma avait initialement été envisagé avec un back Go. Cette combinaison
n'existe pas : le client Go de Prisma n'est plus officiellement supporté depuis 2021.

### 2.5 Authentification — Better Auth

Plugins retenus : `magicLink` et `anonymous`.

Le besoin structurant n'est pas la connexion classique mais la **participation sans compte
via un lien d'invitation**, puis la conversion ultérieure en compte sans perte de données.
Le plugin `anonymous` de Better Auth modélise exactement ce flux : création d'un utilisateur
anonyme, puis fusion avec un compte réel à l'inscription.

Une implémentation maison (magic link + sessions opaques en base) avait été envisagée
lorsque le back était en Go, faute d'équivalent dans cet écosystème. Le passage à TypeScript
rend ce travail inutile.

Choix associé : **sessions opaques en base plutôt que JWT**. Sur une application à base
unique, le JWT n'apporte rien et coûte des problèmes de révocation et de rotation de clés.

### 2.6 Carte — MapLibre GL JS

Les serveurs de tuiles de la fondation OpenStreetMap (`tile.openstreetmap.org`) interdisent
explicitement l'usage par une application tierce. Il faut donc une source de tuiles distincte.

Retenu : MapTiler ou Stadia Maps, en offre gratuite, avec une simple clé d'API.

Écarté pour l'instant : héberger un fichier `.pmtiles` (Protomaps) sur du stockage objet.
C'est la seule option qui reste gratuite à grande échelle, mais elle demande une préparation
de données qui ne se justifie pas dans le cadre du cours.

### 2.7 Recherche de lieu — API Base Adresse Nationale

**Overpass API a été écartée**, alors qu'elle était le choix initial. Ce n'est pas un moteur
de recherche mais une API de requête analytique sur les données OSM :

- recherche par nom en expression régulière, sans tolérance aux fautes ni classement par
  pertinence ;
- latence de plusieurs centaines de millisecondes à plusieurs secondes, incompatible avec
  une autocomplétion à la frappe ;
- les instances publiques limitent à quelques requêtes concurrentes par IP et leur politique
  d'usage exclut de servir de backend à une application interactive.

**Photon est le bon outil OSM** pour ce besoin (typeahead, tolérance aux fautes, classement),
mais son auto-hébergement demande un index OpenSearch et de l'ordre de 8 à 16 Go de RAM.
Deux conséquences : le coût matériel, et surtout le risque de contention mémoire s'il
partage la machine avec PostgreSQL — un OOM killer choisirait probablement la base.

**Décision retenue** : au MVP, pas de recherche de POI. Un champ « nom » libre et un champ
« adresse » géocodé par l'API de la Base Adresse Nationale, qui est gratuite, sans clé, sans
quota et de très bonne qualité sur les adresses françaises.

L'appel est isolé derrière une interface `PlaceSearch` pour permettre un basculement
ultérieur vers Photon ou un service tiers (Geoapify, LocationIQ) sans toucher au reste du
code. Si Photon est ajouté en fin de projet, la démonstration ne doit en aucun cas en
dépendre.

### 2.8 Email — Resend

SDK disponible, offre gratuite suffisante pour le cadre du cours (3 000 emails par mois,
100 par jour — ce plafond quotidien peut être atteint lors d'un envoi groupé d'invitations).

Deux règles :

- ne jamais appeler Resend depuis un handler HTTP ; l'envoi passe par un traitement
  asynchrone ;
- ne jamais auto-héberger de serveur SMTP : les emails partant d'un VPS atterrissent en
  indésirable.

### 2.9 Base locale — Docker

PostgreSQL en conteneur pour le développement. Deux précautions :

- épingler la version majeure (`postgres:17`, jamais `latest`) — un changement de majeure
  refuse de démarrer sur un répertoire de données existant ;
- `docker compose down -v` supprime le volume de données.

### 2.10 Déploiement — non défini

Un VPS est disponible. Le choix de la chaîne de livraison (Docker Compose et Caddy, Kamal,
ou un PaaS auto-hébergé type Coolify) est reporté.

**Vercel a été écarté** pour deux raisons cumulatives : la plateforme ne supporte pas Deno
comme runtime de première classe, et son offre Hobby limite les tâches planifiées à deux
exécutions quotidiennes — insuffisant pour la clôture des votes à échéance et les relances.

---

## 3. Décisions produit challengées

Ces points ont été contestés lors de la phase de cadrage. Les décisions initiales sont
conservées pour le cadre du cours, mais les objections sont consignées.

### 3.1 Le concurrent réel est la conversation WhatsApp

Ni Doodle ni Tricount. La coordination d'une sortie se fait aujourd'hui dans le groupe de
discussion, et WhatsApp propose des sondages natifs depuis 2022. Concurrents directs à
connaître, tous absents du cadrage initial : Howbout, Partiful, Rallly, Splitwise.

### 3.2 Le calendrier personnel d'indisponibilités est l'hypothèse la plus fragile

Il demande un travail de saisie continu, sans récompense immédiate, et avant même qu'un
événement existe. Doodle fonctionne parce qu'on répond ponctuellement à une question unique.

Alternative proposée : un sondage de disponibilité **par événement**, le calendrier de
groupe se remplissant alors comme sous-produit des réponses. Cela inverse la dépendance et
fait arriver la donnée gratuitement.

Décision : conservé tel quel pour le cours, car c'est le différenciateur du sujet.

### 3.3 Le compte obligatoire pénalise le taux de participation

Chaque étape du tunnel d'invitation perd 30 à 50 % des invités. Avec compte obligatoire et
saisie de disponibilités, on peut anticiper 3 à 4 réponses sur 8 invitations.

Décision : **participation sans compte via lien d'invitation**, puis conversion en compte.
C'est ce qui motive le plugin `anonymous` (section 2.5).

### 3.4 Le vote peut produire des états bloqués

Dans l'usage réel, une ou deux personnes décident et les autres suivent. Un vote sans règle
de clôture explicite laisse l'événement en attente indéfiniment.

Décision : le vote est conservé, mais **doit** comporter une échéance, un quorum et une
règle de départage. Voir section 4.2.

---

## 4. Points de modélisation critiques

Ce sont les endroits où le produit peut réellement se casser. Ils coûtent le même effort
d'implémentation que leur version naïve.

### 4.1 Les soldes doivent être une somme de lignes immuables

**Problème** : que se passe-t-il si une dépense est modifiée après qu'un règlement a été
marqué comme effectué ? Une approche où « qui doit combien » est un état global recalculé
produit une incohérence silencieuse.

**Décision** : ne jamais recalculer un état global. Le solde est la somme de lignes :

- une dépense est une ligne, avec ses parts ;
- un règlement est une ligne de type transfert.

Un virement de 20 € reste un transfert de 20 €, même si une dépense antérieure change ; le
delta réapparaît naturellement dans le solde. Aucun verrouillage n'est nécessaire. Une
fonction optionnelle « clôturer l'événement » peut geler la saisie.

### 4.2 Arrondis

Tous les calculs se font en centimes entiers. Le reste de la division est réparti de façon
déterministe (ordre stable par identifiant). Invariant à tester systématiquement : la somme
des parts est strictement égale au montant total.

### 4.3 Minimisation du nombre de virements

Le problème est théoriquement NP-difficile (réductible à subset-sum), mais sans conséquence
à l'échelle visée. Un algorithme glouton — appariement du plus gros créancier avec le plus
gros débiteur — produit au plus N−1 virements et est optimal en pratique pour N ≤ 20.

C'est une fonction pure, sans entrées-sorties : cible idéale pour les tests unitaires.

### 4.4 Participant arrivé après coup

Chaque dépense fige la liste de ses participants au moment de la saisie. Rejoindre plus tard
n'a aucun effet rétroactif. Cette règle doit être visible dans l'interface, faute de quoi
l'utilisateur la prendra pour un défaut.

### 4.5 Confirmation d'un règlement

Si le débiteur déclare seul avoir payé, le modèle produit des litiges. Deux états sont
nécessaires : le débiteur déclare « envoyé », le créancier confirme « reçu ».

### 4.6 Fusion d'une identité anonyme avec un compte existant

Cas limite : un participant anonyme fusionne son identité avec un compte qui est **déjà**
membre du même événement. Deux identités, deux jeux de parts de dépenses, un seul humain.
La règle de fusion doit être définie avant l'implémentation de l'invitation par lien.

### 4.7 Activité annulée

Statut `cancelled` et suppression logique. Ses dépenses ne disparaissent pas — un acompte
non remboursable existe — et sont rattachées à l'événement.

### 4.8 Fuseaux horaires

Les instants sont stockés en UTC avec le fuseau IANA de l'utilisateur. Les indisponibilités
« journée entière » sont des dates civiles et ne doivent jamais être converties en instants.

### 4.9 Administration

Le créateur unique est un point de défaillance : s'il quitte le groupe, l'événement devient
ingérable. Plusieurs administrateurs sont prévus dès le départ, avec transfert automatique
au membre le plus ancien. Coût maintenant : négligeable. Coût plus tard : une migration.

---

## 5. Périmètre de livraison

Une tranche verticale complète est préférable à une couverture large et inachevée :

> créer un événement → lien d'invitation → disponibilités → date retenue → activités →
> dépenses à parts inégales → récapitulatif optimisé des virements

Le reste (notifications, carte, recherche de POI, partage en pourcentage ou en montant fixe)
est ajouté par ordre de priorité dans le temps restant.

---

## 6. Recommandations retirées

Ces éléments relèvent d'une exploitation en production réelle. Ils ont été volontairement
écartés du cadre du cours, et sont conservés ici pour mémoire.

- Sauvegardes chiffrées hors-site avec restic ; réduit à un `pg_dump` avant démonstration.
- Conformité RGPD complète : anonymisation des comptes supprimés (« tombstones »)
  permettant de préserver l'intégrité des soldes.
- Configuration SPF / DKIM / DMARC sur un domaine dédié pour la délivrabilité des
  invitations.
- File d'attente d'envoi (`outbox` + `SELECT … FOR UPDATE SKIP LOCKED`) ; un traitement
  périodique simple suffit ici.
- Contrat OpenAPI et génération de client ; rendu inutile par Hono RPC.
- Hébergement des tuiles cartographiques en Protomaps auto-hébergé.
- Limitation de débit sur les points d'entrée d'invitation et d'envoi de lien magique.

---

## 7. Questions ouvertes

1. Règle exacte de clôture du vote : échéance, quorum, départage en cas d'égalité.
2. Règle de fusion lorsqu'une identité anonyme rejoint un compte déjà participant du même
   événement (section 4.6).
3. Caractéristiques du VPS, qui conditionnent la faisabilité d'un Photon auto-hébergé.
4. Chaîne de déploiement à retenir.

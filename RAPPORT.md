# « On Sort ? » — rapport de projet

**Eliott Barker · Théo Gillet · Paul Ragueneau**
Master 2 — Efrei
Cours : *Culture des concepts informatiques*
Version du 8 septembre 2026 — document tenu à jour au fil du projet.

---

## Table des matières

1. [Introduction](#1-introduction)
2. [Veille concurrentielle](#2-veille-concurrentielle)
3. [Veille technologique](#3-veille-technologique)
4. [Démarche de conception](#4-démarche-de-conception)
5. [Choix retenus et justifications](#5-choix-retenus-et-justifications)
6. [Revirements : ce que nous avons changé et pourquoi](#6-revirements--ce-que-nous-avons-changé-et-pourquoi)
7. [Concepts informatiques mobilisés](#7-concepts-informatiques-mobilisés)
8. [Conception retenue](#8-conception-retenue)
9. [Bilan du jalon M0](#9-bilan-du-jalon-m0)
10. [Journal des révisions](#10-journal-des-révisions)

---

## 1. Introduction

### 1.1 Le problème

Organiser une sortie à plusieurs suppose aujourd'hui d'enchaîner trois outils sans lien
entre eux. On cherche une date avec un sondage, on cherche un lieu avec une carte, et on
partage les dépenses avec une application dédiée. Chaque outil ignore les deux autres :
la liste des participants est ressaisie trois fois, et rien ne relie une dépense à
l'activité qui l'a produite.

### 1.2 La proposition

« On Sort ? » réunit cette chaîne dans un seul produit. La boucle d'usage est continue :

> disponibilités → date → activités → carte → partage des dépenses

L'unification n'est pas un simple regroupement d'interfaces. Elle produit une information
qu'aucun des trois outils ne peut fournir seul : parce que l'application connaît le
programme et qui a assisté à quoi, elle peut répartir une dépense sur les seuls présents
d'une activité, et non sur l'ensemble du groupe.

### 1.3 Objet de ce rapport

Ce document retrace la démarche plutôt que le résultat. Il consigne ce que nous avons
observé pendant la veille, les choix que nous avons faits, ceux que nous avons **défaits**,
et les raisons de chaque bascule. Un choix abandonné y occupe autant de place qu'un choix
retenu : c'est en général là que se trouve l'apprentissage.

---

## 2. Veille concurrentielle

### 2.1 Les outils que le produit remplace

| Outil                         | Fonction couverte   | Limite                                  |
| ----------------------------- | ------------------- | --------------------------------------- |
| Doodle, Framadate, Rallly     | Sondage de dates    | Aucun suivi après le choix de la date   |
| Google Maps, listes partagées | Repérage de lieux   | Aucune notion de groupe ni de programme |
| Tricount, Splitwise           | Partage de dépenses | Aucune notion d'activité ni de présence |

### 2.2 Le concurrent que nous avions sous-estimé

Notre cadrage initial positionnait le produit contre Doodle et Tricount. Cette analyse
était fausse.

Le concurrent réel est **la conversation de groupe elle-même**. La coordination d'une sortie
se fait dans WhatsApp ou Messenger, et WhatsApp propose des sondages natifs depuis 2022 —
ce qui a largement vidé Doodle de son usage pour les groupes d'amis. Le produit ne doit
donc pas battre trois applications spécialisées, mais un geste : envoyer un message.

Cette révision a une conséquence directe sur la conception. Elle explique pourquoi nous
avons ensuite consacré autant d'attention au parcours d'invitation, et pourquoi le
récapitulatif des dettes doit être copiable en texte : le vecteur de diffusion du produit
reste la conversation de groupe, pas l'application.

### 2.3 Les concurrents directs

Trois produits occupent déjà exactement notre positionnement et étaient absents de notre
cadrage :

- **Howbout** — calendriers partagés entre amis, disponibilités et plans, sur le même
  postulat que le nôtre ;
- **Partiful** — création et partage d'événements sociaux, très fort sur la friction
  d'invitation ;
- **Rallly** — sondage de dates libre et sans compte.

Enseignement de veille : l'absence de concurrent identifié en début de projet est presque
toujours un défaut de recherche, pas une opportunité de marché.

### 2.4 Ce que la concurrence nous a appris sur la friction

Tricount, Rallly et Doodle fonctionnent sans compte obligatoire. Ce n'est pas un détail
d'ergonomie mais un choix structurel : dans un tunnel d'invitation, chaque étape
supplémentaire fait perdre une fraction importante des invités. Avec huit invitations,
l'obligation de créer un compte puis de saisir des disponibilités laisse
raisonnablement attendre trois à quatre réponses.

Nous avons malgré tout retenu le compte obligatoire. La section 6 explique ce choix et ce
qu'il nous rend en retour.

---

## 3. Veille technologique

### 3.1 Runtimes JavaScript côté serveur

Trois environnements coexistent aujourd'hui, et la distinction est instructive : elle
oppose une plateforme historique enrichie à deux réécritures qui intègrent l'outillage.

|             | TypeScript                                            | Outillage intégré                          | Écosystème     | Maturité       |
| ----------- | ----------------------------------------------------- | ------------------------------------------ | -------------- | -------------- |
| **Node.js** | natif depuis les versions récentes (retrait de types) | test, watch                                | le plus large  | la plus élevée |
| **Deno 2**  | natif                                                 | `fmt`, `lint`, `test`, `task`, permissions | compatible npm | bonne          |
| **Bun**     | natif                                                 | test, bundler, compilation en binaire      | compatible npm | plus récente   |

L'enseignement principal de cette veille est négatif : pour une application dont le travail
consiste à lire et écrire dans une base, **le choix du runtime est la décision la moins
conséquente de la pile**. Les trois traitent des entrées-sorties, aucun n'est le goulot
d'étranglement. Ce qui les sépare réellement tient à l'outillage et au confort, pas à la
performance.

Nous avons retenu Deno, puis nous sommes revenus à Node — et c'est cette bascule qui a
validé l'enseignement plutôt que de le contredire. Voir la section 6.9.

### 3.2 Accès aux données

Nous avons examiné trois approches, sous un critère qui nous est propre : la requête
centrale du produit est un calcul d'intersection de créneaux temporels.

- **Prisma** — le plus complet, mais **aucun support des types intervalles de PostgreSQL**.
  Notre requête principale sortirait du modèle.
- **Drizzle** — proche du SQL, types personnalisés possibles, migrations intégrées.
- **Kysely** — constructeur de requêtes, excellente affinité avec le SQL brut, migrations à
  outiller séparément.

Ce critère unique a suffi à trancher en faveur de Drizzle. Il illustre un principe général :
un outil ne s'évalue pas dans l'absolu mais sur le point dur du problème traité.

Le principe s'est ensuite retourné contre notre conclusion : nous avons renoncé aux types
intervalles, ce qui a **supprimé le point dur** et donc le critère. Prisma est alors redevenu
le meilleur choix. Voir la section 6.10.

### 3.3 Cartographie — quatre problèmes distincts

La veille cartographique a été la plus formatrice, parce qu'elle a d'abord révélé une
confusion de notre part. « Faire une carte » recouvre en réalité quatre problèmes
indépendants, servis par des outils différents :

| Problème             | Question                                           | Outils                            |
| -------------------- | -------------------------------------------------- | --------------------------------- |
| **Rendu**            | Comment dessiner la carte dans le navigateur ?     | Leaflet, MapLibre GL              |
| **Tuiles**           | D'où viennent les images ou les vecteurs du fond ? | MapTiler, Stadia, Protomaps       |
| **Géocodage**        | Comment transformer une adresse en coordonnées ?   | Base Adresse Nationale, Nominatim |
| **Recherche de POI** | Comment trouver « Le Comptoir Général » ?          | Photon, Geoapify, Foursquare      |

Deux erreurs que cette grille nous a évitées :

1. **« Leaflet, c'est la carte OpenStreetMap gratuite. »** Faux. Leaflet est un moteur de
   rendu. Il ne fournit aucune tuile, et les serveurs de la fondation OpenStreetMap
   interdisent explicitement leur usage par une application tierce.
2. **« Overpass API sert à chercher des lieux. »** Faux également, et c'était notre choix
   initial. Voir la section 6.

### 3.4 Authentification : session opaque ou jeton signé

Le débat entre session en base et JWT est l'un des plus caricaturés du domaine. Notre
lecture est que le JWT résout un problème que nous n'avons pas : la vérification d'identité
sans accès à un état partagé, utile entre services indépendants. Sur une application
mono-base, il n'apporte rien et introduit deux difficultés réelles — la révocation
immédiate et la rotation des clés.

Nous retenons la session opaque en base.

### 3.5 Temps réel : trois familles

| Technique          | Sens             | Coût       | Adapté à                   |
| ------------------ | ---------------- | ---------- | -------------------------- |
| Sondage périodique | client → serveur | trivial    | tout, de façon dégradée    |
| **SSE**            | serveur → client | faible     | flux de notifications      |
| WebSocket          | bidirectionnel   | plus élevé | édition collaborative, jeu |

Notre besoin — un décompte de votes qui s'actualise chez tous les participants — est
strictement unidirectionnel. Le duplex du WebSocket n'apporterait rien.

Contrainte technique remarquable, découverte pendant cette veille : l'API `EventSource` du
navigateur **ne permet pas d'envoyer d'en-têtes HTTP**. L'authentification d'un flux SSE
passe donc obligatoirement par un cookie de session, ce qui impose de servir l'interface et
l'API sur la même origine. Une limitation d'une API cliente contraint ainsi la topologie de
déploiement du serveur — bon exemple de la façon dont une contrainte se propage à travers
les couches.

---

## 4. Démarche de conception

### 4.1 Méthode : la contradiction systématique

Nous avons délibérément adopté une méthode adversariale. Chaque décision — produit comme
technique — a été soumise à une contradiction argumentée avant d'être retenue : quelle
hypothèse d'usage est naïve, quel concurrent est sous-estimé, quel cas limite casse le
modèle, que coûte réellement ce choix.

Cette méthode a un rendement mesurable dans ce projet : **trois de nos choix initiaux
étaient techniquement impossibles**, et n'auraient été découverts qu'à l'écriture du code.

### 4.2 Traçabilité

Les décisions ne vivent pas dans une conversation mais dans le dépôt Git, en trois
documents versionnés :

| Document                       | Rôle                                                     |
| ------------------------------ | -------------------------------------------------------- |
| `README.md`                    | Le produit, son périmètre, sa pile technique             |
| `docs/decisions-techniques.md` | Chaque choix, les options écartées, la raison            |
| `docs/conception.md`           | Le modèle de données, les règles, l'API, le séquencement |

Quand une décision change, le document correspondant est corrigé dans le même commit que le
changement. Un document qui contredit le code est pire que pas de document.

### 4.3 Séquencement par jalons démontrables

Le plan de développement est découpé en jalons dont **chacun laisse une application
fonctionnelle**, plutôt qu'en couches horizontales (toute la base, puis toute l'API, puis
toute l'interface). Ce découpage rend la coupe possible à tout moment sans laisser de
fonctionnalité à moitié faite.

---

## 5. Choix retenus et justifications

### 5.1 Pile technique

| Couche           | Choix                     | Raison principale                                                 |
| ---------------- | ------------------------- | ----------------------------------------------------------------- |
| Front            | Vue 3 + Vite, SPA         | Aucun enjeu de référencement, tout est derrière authentification  |
| Back             | Node 24 LTS + Hono        | Écosystème le mieux éprouvé pour l'outillage que nous exécutons   |
| Base             | PostgreSQL 17             | Robuste, gratuit, conteneurisable en une commande                 |
| Accès données    | Prisma 7                  | Migrations générées, meilleur confort une fois le point dur levé  |
| Authentification | Better Auth, lien magique | Pas de mot de passe à stocker ni à protéger                       |
| Carte            | Leaflet                   | Aucune dépendance à WebGL                                         |
| Géocodage        | Base Adresse Nationale    | Gratuit, sans clé, sans quota, officiel, excellent sur la France  |
| Temps réel       | SSE                       | Flux unidirectionnel                                              |
| E-mail           | Resend                    | Envoi transactionnel, pas de serveur SMTP à administrer           |

### 5.2 Le choix de Hono RPC

Utiliser TypeScript des deux côtés ne suffit pas à garantir la cohérence entre le client et
le serveur : sans mécanisme explicite, les types se dupliquent et divergent. Hono RPC
expose le type du routeur serveur au client, qui l'importe directement.

```ts
import type { AppType } from '@api/main'
export const api = hc<AppType>('/api')
```

Aucune génération de code, aucun contrat OpenAPI à maintenir, et une incohérence entre les
deux côtés devient une erreur de compilation. Les schémas de validation écrits côté serveur
sont par ailleurs réutilisés tels quels par les formulaires : une règle, une définition.

C'est la contrepartie que nous obtenons pour avoir renoncé à Go, dont la robustesse de
typage était l'argument principal.

---

## 6. Revirements : ce que nous avons changé et pourquoi

Cette section est le cœur du rapport. Chaque ligne du tableau correspond à une décision que
nous avons prise, puis défaite.

| #   | Décision initiale           | Décision finale            | Déclencheur                                 |
| --- | --------------------------- | -------------------------- | ------------------------------------------- |
| 1   | Backend en Go               | Deno 2 + Hono              | Coût de la double frontière de types        |
| 2   | Prisma comme ORM            | Drizzle                    | Prisma ne gère pas les types intervalles    |
| 3   | Overpass API pour les lieux | BAN, Photon en option      | Overpass n'est pas un moteur de recherche   |
| 4   | Déploiement sur Vercel      | VPS                        | Vercel ne supporte pas Deno                 |
| 5   | MapLibre GL                 | Leaflet                    | Dépendance à WebGL, risque en démonstration |
| 6   | Participation sans compte   | Compte obligatoire         | Arbitrage assumé friction / simplicité      |
| 7   | Vote sur les dates          | Date fixée par le créateur | Simplification du modèle                    |
| 8   | Dépenses immuables          | Aucun solde stocké         | Formulation plus simple du même invariant   |
| 9   | Sondage périodique          | SSE                        | Choix pédagogique assumé                    |
| 10  | Deno 2                      | Node 24 LTS                | Bénéfice asymétrique du runtime             |
| 11  | Contrainte `EXCLUDE`        | Invariant applicatif       | Aucun ORM ne l'exprime                      |
| 12  | Drizzle                     | Prisma 7                   | Le critère qui l'avait écarté a disparu     |
| 13  | Contrôle du schéma par outil | Preuve empirique          | L'outil de contrôle n'existe pas            |
| 14  | Rattrapage d'erreur local   | Gestionnaire global        | Chaque route future aurait divergé          |
| 15  | Vite 8 → Vite 7             | **Retour à Vite 8**        | Le diagnostic était faux                    |

Trois d'entre eux — les numéros 1, 2 et 4 — portent sur des configurations qui **n'existent
tout simplement pas**. Le numéro 13 aussi. Les autres sont des arbitrages.

Les numéros 1 à 12 datent du cadrage, avant toute ligne de code. Les numéros 13 à 15 sont nés
de l'implémentation, et le dernier est le plus instructif du document : c'est un revirement de
revirement, une décision que nous avons prise, puis reconnue fausse, puis annulée.

### 6.1 Go → Deno *(incompatibilités en cascade)*

Notre première pile associait un backend Go, Prisma comme ORM et Better Auth pour
l'authentification. Deux de ces trois éléments sont incompatibles avec le premier :

- **Prisma ne supporte pas Go.** Le client Go n'est plus officiellement maintenu depuis
  2021.
- **Better Auth est une bibliothèque TypeScript.** Elle suppose un environnement
  d'exécution JavaScript.

Nous aurions découvert ces deux impossibilités au premier jour d'implémentation.

Au-delà de l'incompatibilité, l'analyse a fait apparaître un coût structurel : Go et
TypeScript de part et d'autre d'une frontière HTTP imposent deux systèmes de types, deux
couches de validation et une duplication manuelle de chaque objet transféré. Pour une
application de gestion, ce coût n'est pas compensé par les avantages réels de Go — binaire
unique, faible empreinte mémoire.

**Enseignement** : une pile ne se choisit pas composant par composant. Les incompatibilités
n'apparaissent qu'à l'assemblage.

### 6.2 Overpass → Base Adresse Nationale *(erreur de catégorie)*

Nous avions retenu Overpass API pour la recherche de lieux. Overpass est une API de requête
analytique sur les données OpenStreetMap, pas un moteur de recherche :

- la recherche par nom s'écrit en expression régulière — ni tolérance aux fautes, ni
  classement par pertinence ;
- la latence se compte en centaines de millisecondes à plusieurs secondes, incompatible avec
  une saisie assistée ;
- la politique d'usage des instances publiques **exclut explicitement** de servir de
  backend à une application interactive.

Le bon outil du même écosystème est **Photon**, un géocodeur bâti sur un index de recherche,
qui apporte la saisie assistée et la tolérance aux fautes. Mais son auto-hébergement
réclame un index et de l'ordre de 8 à 16 Go de mémoire, avec un risque de contention si la
base de données partage la machine.

Décision retenue : **pas de recherche de points d'intérêt au départ**. Un champ de nom libre
et une adresse géocodée par la Base Adresse Nationale — gratuite, sans clé, sans quota et de
très bonne qualité sur les adresses françaises. L'appel est isolé derrière une interface,
ce qui permettra d'y substituer Photon sans toucher au reste.

**Enseignement** : la première question à poser d'un outil n'est pas « fournit-il la
donnée ? » mais « à quelle classe de problème répond-il ? ».

### 6.3 Vercel → VPS *(contrainte transitive)*

Nous voulions déployer sur Vercel. Vercel ne supporte pas Deno comme environnement
d'exécution de première classe.

L'analyse a mis en évidence une chaîne de contraintes que nous n'avions pas anticipée :
choisir une plateforme sans serveur persistant interdisait aussi d'auto-héberger Photon,
qui réclame une machine ; et l'offre gratuite de Vercel limite les tâches planifiées à deux
exécutions quotidiennes.

**Enseignement** : une décision d'hébergement n'est pas indépendante des décisions
applicatives. Ici, un choix de plateforme aurait silencieusement supprimé une option
fonctionnelle décidée ailleurs.

### 6.4 MapLibre → Leaflet *(critère de contexte)*

MapLibre GL est techniquement supérieur : tuiles vectorielles, restylage côté client,
rotation, zoom continu. Nous avons choisi Leaflet.

Aucun des avantages de MapLibre ne concerne notre besoin, qui consiste à afficher des points
ordonnés. En regard, Leaflet pèse environ cinq fois moins et surtout **ne dépend pas de
WebGL** — lequel peut être désactivé ou basculer en rendu logiciel dans une machine
virtuelle ou un bureau distant. Sur un projet dont la restitution passe par une
démonstration faite sur une machine que nous ne maîtrisons pas, ce risque est réel.

**Enseignement** : le meilleur outil dans l'absolu n'est pas le meilleur outil en contexte.
Ici, le critère décisif n'était pas fonctionnel mais lié aux conditions de restitution.

### 6.5 Compte anonyme → compte obligatoire *(arbitrage assumé)*

Nous avions d'abord retenu la participation sans compte, par un lien d'invitation créant une
identité anonyme convertible ensuite en compte réel. L'argument était le tunnel
d'invitation, décrit en 2.4.

Cette voie faisait apparaître un cas limite coûteux. Une même personne pouvait exister deux
fois dans un même événement — une fois via son compte, une fois via une identité anonyme
créée depuis un autre appareil. La conversion exigeait alors une **fusion transactionnelle**
de deux lignes de participant : réattribution des parts de dépenses, des règlements et des
votes, avec une règle de résolution pour chaque conflit.

Nous avons finalement retenu le compte obligatoire. L'objection sur la friction est acceptée
et assumée ; en contrepartie, toute la mécanique de fusion disparaît, et une simple
contrainte d'unicité suffit. Trois canaux d'invitation — lien à copier, adresse e-mail, ami
dans l'application — compensent partiellement la friction ajoutée.

**Enseignement** : un choix produit se paie en complexité de modèle. L'arbitrage doit être
fait en connaissant les deux montants.

### 6.6 Vote sur les dates → date fixée par le créateur *(simplification)*

Notre cadrage prévoyait une décision collective par vote, sur les dates comme sur les
activités. La clarification de l'usage réel a montré que le créateur d'un événement fixe la
date — précise, ou sous forme de période pour un séjour — et que les invités acceptent ou
déclinent.

Ce recadrage supprime, en une phrase, toute une sous-partie du système : grille de créneaux,
quorum, règle de départage, échéance de clôture. Le vote subsiste là où il a du sens, sur
les activités.

**Enseignement** : la moitié de la complexité d'un système vient souvent d'une exigence mal
formulée plutôt que d'un problème difficile.

### 6.7 Dépenses immuables → aucun solde stocké *(reformulation)*

Le problème identifié : si une dépense est modifiée après qu'un remboursement a été marqué
comme effectué, un solde conservé en base devient silencieusement faux.

Notre première réponse fut de rendre les dépenses immuables — toute modification créant une
nouvelle version. Une analyse plus fine a montré que l'immuabilité était excessive. Il
suffit que :

1. aucun solde ne soit jamais stocké, mais toujours recalculé depuis les parts et les
   règlements ;
2. un règlement soit une ligne indépendante.

Un virement de 20 € reste un virement de 20 € même si une dépense change ensuite ; l'écart
réapparaît naturellement dans le solde recalculé. Les dépenses peuvent donc rester
modifiables.

**Enseignement** : quand une solution paraît lourde, l'invariant qu'elle protège est souvent
mal formulé. Reformuler l'invariant est moins coûteux que renforcer la solution.

### 6.8 Sondage → SSE *(choix pédagogique)*

Un rafraîchissement toutes les trois secondes aurait suffi fonctionnellement, et serait plus
robuste. Nous avons retenu SSE en connaissance de cause, le sujet du cours justifiant de
mettre en œuvre le mécanisme adapté plutôt que son approximation. Cette décision est
consignée comme telle : c'est un choix de projet d'étude, pas une optimisation.

### 6.9 Deno → Node *(asymétrie du bénéfice)*

Nous avions retenu Deno pour son TypeScript natif, son bac à sable de permissions et son
outillage intégré. Nous sommes revenus à Node, sur un raisonnement qui ne portait pas sur les
performances mais sur **la nature du code concerné** :

- **le code de l'API, nous l'écrivons.** Les avantages de Deno s'y appliquent ;
- **l'outillage front, nous l'exécutons.** Vite, Vitest et `vue-tsc` sont conçus, testés et
  publiés pour Node. Les faire tourner sous Deno n'apporte aucun de leurs avantages, et
  n'apporte que leur risque de compatibilité.

Deux gains supplémentaires ont emporté la décision. Le partage de types devient
**structurel** : en monorepo `npm workspaces`, le front déclare l'API en dépendance et
importe le type de son routeur, ce qui supprime le montage à base de carte d'import qu'exigeait
Deno. Et un risque non vérifié disparaît : Better Auth sous Deno était la combinaison la moins
éprouvée de la pile.

Ce revirement fut bon marché parce que **Hono est agnostique du runtime** : il n'a coûté qu'un
adaptateur, `@hono/node-server`.

**Enseignement** : le bénéfice d'un outil dépend de la position qu'on occupe vis-à-vis de lui.
Auteur ou simple exécutant, ce n'est pas le même calcul.

### 6.10 Contrainte `EXCLUDE` → invariant applicatif, et Drizzle → Prisma

Ces deux revirements n'en font qu'un, et c'est ce qui les rend instructifs.

Nous voulions renoncer à écrire des migrations à la main, et nous pensions que cela signifiait
changer d'ORM. **Le diagnostic était faux.** `drizzle-kit generate` produit ses migrations par
différence, exactement comme `prisma migrate dev` : aucun des deux n'oblige à écrire du SQL.
Le seul SQL manuel venait de la contrainte `EXCLUDE USING gist`, qu'aucun ORM TypeScript ne
sait exprimer.

La vraie question n'était donc pas « quel ORM » mais « garde-t-on la contrainte ». Nous y avons
renoncé : les disponibilités passent de `tstzrange` à deux colonnes `timestamptz`, et la
non-superposition est appliquée en couche service, par fusion des plages dans une transaction
plutôt que par rejet.

Ce renoncement a supprimé le critère unique qui avait écarté Prisma — l'absence de types
intervalles. Prisma est alors redevenu le meilleur choix, et l'ORM a changé **en conséquence**
de la décision de modélisation, non l'inverse.

**Enseignement** : avant de changer d'outil, vérifier que la gêne vient bien de l'outil. Ici,
elle venait d'une fonctionnalité de la base de données que nous avions choisie nous-mêmes.

### 6.11 Ce que l'installation réelle a démenti

Les versions retenues avaient été vérifiées sur les registres. L'installation les a
contredites sur quatre points, dont aucun n'était lisible dans les métadonnées :

1. **`npm install` échouait.** Better Auth déclare un peer *optionnel* sur `vitest ^2 || ^3
   || ^4`. Un peer optionnel passe habituellement pour un avertissement ; en monorepo, il fait
   échouer la résolution. Vitest est descendu en 4.1.11.
2. **Prisma 7 refuse `url` dans le bloc `datasource`.** La connexion se déclare dans
   `prisma.config.ts` et le client exige un adaptateur de pilote — d'où l'ajout de
   `@prisma/adapter-pg` et de `pg`, alors que nous avions écrit que Prisma embarquait le sien.
3. **TypeScript 6 déprécie `baseUrl`**, avec une erreur bloquante.
4. **npm 12 n'exécute plus les scripts d'installation sans autorisation nominative.** Sans
   elle, ni le moteur Prisma ni le binaire esbuild ne sont téléchargés.

**Enseignement** : la compatibilité déclarée n'est pas la compatibilité constatée. Une pile ne
se valide pas sur un tableau de versions, mais en l'installant.

### 6.12 Contrôle par outil → preuve empirique *(l'outil n'existait pas)*

Le modèle de données d'authentification avait été rédigé de mémoire. Pour le valider, le plan
prévoyait de le confronter à la sortie de l'outil en ligne de commande de la bibliothèque
d'authentification, dans la version que nous avions installée.

**Cette version de l'outil n'existe pas.** L'outil plafonne plusieurs versions en arrière de la
bibliothèque principale, et cette dernière n'embarque aucun binaire. Le garde-fou censé
rattraper une erreur de mémoire n'existait donc pas non plus.

Nous l'avons remplacé par une preuve empirique : un test qui mène une connexion complète —
demande du lien, consommation de l'adresse réellement émise, puis vérification qu'un
utilisateur et une session sont bien créés en base de données. Le test précédent ne créait
qu'une demande de vérification : il ne prouvait rien sur les tables écrites au moment où le
lien est consommé.

**Enseignement** : une preuve construite à partir du comportement réel du système vaut mieux
qu'un écart calculé par un outil, et elle reste ensuite comme test de non-régression. La
faiblesse d'un contrôle n'apparaît que lorsqu'on essaie de l'exécuter.

### 6.13 Rattrapage local → gestionnaire global *(portée d'une correction)*

La lecture de session n'était entourée d'aucun rattrapage d'erreur : une panne de base de
données aurait produit une réponse générique, hors du format uniforme que la conception impose
à toute l'API.

La correction évidente était un rattrapage local autour de l'appel fautif. Nous avons imposé un
**gestionnaire d'erreur global** sur l'application. Motif : un rattrapage local n'aurait protégé
que cette route, et chacune des routes des jalons suivants aurait recommencé à diverger, une à
une, jusqu'à ce que le format uniforme ne soit plus qu'une intention.

**Enseignement** : à correction équivalente, préférer celle dont la portée couvre les cas qui
n'existent pas encore. Une règle que chaque nouveau cas doit réappliquer à la main n'est pas une
règle, c'est une consigne.

### 6.14 Vite 8 → Vite 7 → Vite 8 *(un contournement n'est pas un diagnostic)*

C'est le revirement le plus instructif du projet, parce que c'est celui où **nous avons eu
tort**.

L'intégration continue échouait sous Linux : un binaire natif manquant. Diagnostic posé : la
version 8 de l'outil de construction dépend d'un compilateur qui embarque un binaire par
plateforme, et le fichier de verrouillage n'enregistrait que celui de notre machine. Trois
contournements ont été essayés, tous ont échoué. Nous avons alors rétrogradé d'une version
majeure, vers une version qui n'a pas de binaire natif. L'intégration continue est passée au
vert.

**Le symptôme avait disparu, la cause était intacte.** Un test ultérieur, mené sur une copie du
dépôt, a montré qu'une réinstallation réellement propre — en supprimant à la fois le dossier des
dépendances **et** le fichier de verrouillage — enregistre les quinze variantes de plateforme,
Linux comprise. Notre test initial avait conservé le dossier des dépendances, et l'option que
nous avions employée ne re-résout pas les dépendances optionnelles de plateforme.

La cause n'était pas la version de l'outil, mais un fichier de verrouillage construit par
ajouts successifs et jamais régénéré. La rétrogradation a été annulée.

**Enseignement** : un contournement qui fait disparaître le symptôme ne prouve pas que le
diagnostic était juste. Ici, la correction fonctionnait pour une raison que nous n'avions pas
comprise — et elle nous aurait fait traîner une version en retard pendant tout le projet, en
croyant l'avoir choisie.

---

## 7. Concepts informatiques mobilisés

### 7.1 Où placer un invariant — et ce que coûte de le déplacer

Deux indisponibilités d'un même utilisateur ne doivent jamais se recouvrir. Cette règle peut
être confiée à PostgreSQL :

```sql
EXCLUDE USING gist (user_id WITH =, period WITH &&)
```

La base refuse alors l'insertion, quel que soit le code appelant. Un invariant appliqué par le
système de stockage est structurellement plus fort qu'un invariant applicatif : il ne peut pas
être contourné par un chemin de code oublié, ni par une écriture faite depuis un autre
programme.

**Nous y avons pourtant renoncé**, et l'arbitrage vaut d'être exposé. Aucun ORM TypeScript ne
modélise les contraintes d'exclusion. Les conserver imposait une migration écrite et maintenue
à la main, plus la vigilance de vérifier qu'un outil de migration travaillant par différence ne
cherche pas à supprimer un objet qu'il ne connaît pas.

La règle est donc remontée en couche service : les plages qui se recouvrent sont fusionnées
dans une transaction avec verrou de ligne. La correction ne repose plus sur la base mais sur la
discipline du code.

Ce que ce déplacement coûte réellement : la garantie ne tient plus que tant qu'un seul
programme écrit dans cette table. Le jour où un script de migration de données ou une tâche
d'administration écrit directement, l'invariant peut être violé sans que rien ne s'y oppose.
C'est acceptable ici, et ce ne le serait pas sur un système où plusieurs services partagent la
base.

**Le concept à retenir n'est pas « déléguer à la base est mieux », mais que la place d'un
invariant détermine l'ensemble des acteurs qui ne peuvent pas le violer.**

### 7.2 État dérivé contre état stocké

Un solde est une **fonction** des dépenses et des règlements. Le stocker crée une seconde
source de vérité, qu'il faut ensuite maintenir cohérente à chaque écriture. Ne pas le
stocker rend la dérive impossible par construction.

Le coût est un calcul à chaque lecture. À notre échelle, il est négligeable — et c'est
précisément le raisonnement qui doit précéder toute dénormalisation.

### 7.3 Représentation des montants

Les montants sont stockés en **centimes entiers**. La représentation en virgule flottante
IEEE 754 ne peut pas représenter exactement 0,1 : additionner des dixièmes accumule une
erreur, et deux calculs équivalents peuvent produire des soldes différents.

Conséquence directe : la division d'un montant ne tombe pas juste. Répartir 10,00 € entre
trois personnes donne 3,34 / 3,33 / 3,33. La règle de répartition du reste doit être
**déterministe** — les premiers participants, dans un ordre stable, reçoivent un centime
supplémentaire — et l'invariant « la somme des parts égale le montant total » est vérifié
par les tests.

### 7.4 Complexité algorithmique : la minimisation des virements

Minimiser le nombre de virements nécessaires pour solder un ensemble de dettes est un
problème **NP-difficile**, réductible au problème de la somme de sous-ensembles.

Ce résultat est théorique et, dans notre cas, sans conséquence pratique : à moins de vingt
participants, une heuristique gloutonne — apparier le plus gros créancier au plus gros
débiteur — produit au plus N−1 virements et donne le résultat optimal dans la quasi-totalité
des cas réels.

Illustration utile : la classe de complexité d'un problème n'implique pas qu'il soit
difficile *à l'échelle où on le rencontre*. Connaître les deux faits est ce qui permet de ne
pas sur-concevoir.

### 7.5 Canal auxiliaire et énumération de comptes

Un formulaire qui répond « aucun compte associé à cette adresse » transforme l'application
en **oracle** : n'importe qui peut tester une adresse et savoir si elle est inscrite. C'est
une fuite d'information qui ne passe par aucune donnée explicitement exposée.

Notre réponse unifie les deux cas. Saisir une adresse produit toujours la même réponse : si
un compte existe, une invitation interne est créée ; sinon, un e-mail d'invitation est
envoyé. L'appelant ne peut pas distinguer les deux situations, et le produit y gagne au
passage un parcours d'interface au lieu de deux.

### 7.6 Propagation des contraintes entre couches

Trois exemples relevés dans ce projet :

1. `EventSource` ne peut pas envoyer d'en-têtes → l'authentification passe par cookie → le
   front et l'API doivent partager la même origine.
2. Photon exige une machine persistante → toute plateforme sans serveur est exclue.
3. Le navigateur limite le nombre de connexions par domaine en HTTP/1.1 → un flux SSE
   permanent impose HTTP/2.

Aucune de ces contraintes n'appartient à la couche où elle produit son effet.

### 7.7 Une vérification qui ne vérifie pas ce qu'elle croit

Trois défauts de ce projet ont survécu longtemps parce qu'un contrôle existait, passait, et ne
portait pas sur ce qu'on croyait.

- La vérification des types du dépôt était cassée pendant **cinq tâches consécutives**. Personne
  ne l'a vu : la commande de test passait, et c'est elle qu'on lançait. L'intégration continue
  aurait été rouge à sa première exécution — qui n'a eu lieu qu'au tout dernier jalon.
- L'analyseur de code était activé mais **sans aucune règle**, séquelle d'une migration
  automatique de configuration. L'étape « format et analyse » ne contrôlait que la mise en forme.
- La correction du port du mandataire avait été validée en exportant la variable dans le
  terminal — c'est-à-dire dans des conditions qui n'étaient pas celles de son usage réel, où la
  variable vient d'un fichier. La correction ne fonctionnait pas dans le flux documenté.

Le point commun est le même dans les trois cas : **un contrôle vert a été pris pour une preuve
sans qu'on vérifie ce qu'il exerçait**. Un test qui n'a jamais échoué, une règle qui n'existe
pas, une vérification menée dans les mauvaises conditions produisent la même chose — une
confiance sans fondement, qui est pire que pas de contrôle du tout, parce qu'elle dispense de
regarder.

### 7.8 Consigner le coût d'une erreur, pas seulement la décision

Chaque décision prise pendant l'implémentation a été consignée avec trois éléments : ce qui a
été décidé, pourquoi, et **ce que ça coûte si la décision est mauvaise**.

Ce troisième élément s'est révélé le plus utile, pour deux raisons. Il oblige à mesurer l'enjeu
avant de trancher, ce qui change la décision elle-même : on ne délibère pas de la même façon
sur « une ligne à réécrire » et sur « une migration de base de données ». Et il permet de
rouvrir une décision sans rejouer tout le raisonnement — ce qui est exactement ce qui s'est
passé pour le revirement 15, revenu sur la table parce que son coût annoncé était faible.

Vingt-quatre décisions ont ainsi été consignées, dont une s'est révélée fausse.

---

## 8. Conception retenue

La conception détaillée figure dans [`docs/conception.md`](docs/conception.md). Résumé.

### 8.1 Modèle de domaine

```
Utilisateur ──► amis, indisponibilités personnelles
     │
     └──► Groupe ──► calendrier partagé (superposition des indisponibilités)
              │
              └──► Événement (période fixée par le créateur)
                       ├──► participants (accepte / décline)
                       ├──► activités ──► vote ──► programme
                       └──► dépenses ──► parts ──► soldes ──► règlements
```

### 8.2 Règles structurantes

- Aucun état de la machine à états d'un événement n'est **absorbant** : un événement ne peut
  pas se retrouver bloqué.
- Le vote sur une activité est clos par un administrateur, sans échéance ni quorum. Les
  votes restent modifiables tant que l'activité est proposée.
- Une dépense **fige** ses parts à la saisie : rejoindre un événement tardivement n'a aucun
  effet rétroactif.
- Un règlement comporte deux états : le débiteur déclare, le créancier confirme.

### 8.3 Séquencement

| Jalon | Contenu                               | Démonstration                               |
| ----- | ------------------------------------- | ------------------------------------------- |
| M0    | Socle technique, authentification     | Connexion                                   |
| M1    | Événement, invitations, participants  | Un tiers rejoint depuis son téléphone       |
| M2    | Activités, vote, SSE                  | Le décompte bouge en direct sur deux écrans |
| M3    | Dépenses, soldes, virements minimisés | Quatre virements au lieu de dix             |
| M4    | Groupes, calendrier partagé           | Le créneau qui convient à tous              |
| M5    | Carte, géocodage                      | Le programme sur une carte                  |
| M6    | Amis, notifications                   |                                             |
| M7    | Finitions                             |                                             |

À l'issue de M3, le produit est cohérent et se défend seul.

---

## 9. Bilan du jalon M0

### 9.1 Ce qui est livré

Le premier jalon est terminé et fusionné. Sa promesse — *un utilisateur saisit son adresse,
reçoit un lien magique, clique, et l'application affiche son identité* — est tenue, et prouvée
par un test qui mène le parcours complet jusqu'à la vérification en base de données qu'un
utilisateur et une session existent.

| | |
|---|---|
| Tâches planifiées et livrées | 10 sur 10 |
| Commits | 35 |
| Tests | 18, tous au vert |
| Décisions consignées | 24 |
| Intégration continue | verte |

Aucune fonctionnalité métier n'est encore écrite : ni groupes, ni événements, ni dépenses.
C'est délibéré, et c'est la règle que nous nous sommes donnée — **une migration par jalon**, pas
de table créée avant le code qui l'écrit.

### 9.2 Ce que la phase de cadrage avait rattrapé

Avant toute ligne de code, elle avait permis d'identifier :

- **trois incompatibilités bloquantes** — Prisma avec Go, Better Auth avec Go, Deno avec
  Vercel — dont chacune aurait coûté une réécriture ;
- **une erreur de catégorie** sur l'outil de recherche de lieux ;
- **quatre incompatibilités de versions** que seule une installation réelle a révélées ;
- **cinq cas limites** de modélisation dont le traitement ne coûte rien s'il est prévu, et cher
  s'il est découvert après coup.

### 9.3 Ce que l'implémentation a rattrapé, et que le cadrage n'avait pas vu

C'est le résultat le plus intéressant du jalon : **cinq défauts, dont quatre provenaient de
notre propre plan** — celui-là même qui avait été rédigé pour les éviter.

| Défaut | Comment il a survécu |
|---|---|
| Vérification des types cassée pendant cinq tâches | Seuls les tests étaient lancés |
| L'analyseur de code n'appliquait aucune règle | Configuration activée mais vide |
| La commande de lancement ne démarrait pas l'interface | Personne ne l'avait tapée en entier |
| Le garde-fou du modèle de données n'existait pas | L'outil prévu n'a jamais été exécuté |
| Fichier de verrouillage incomplet | Première exécution de l'intégration continue au dernier jalon |

Un fil relie ces cinq lignes : **rien de ce qui n'est pas exécuté n'est vérifié**. Un plan bien
écrit ne protège pas de ce qu'il ne fait pas exécuter, et la colonne de droite ne contient que
des choses qu'on croyait faites.

### 9.4 Ce que nous avons eu tort de décider

Une décision consignée s'est révélée fausse : la rétrogradation de l'outil de construction
(section 6.14). Elle a été annulée, et elle est conservée dans ce rapport plutôt qu'effacée,
parce qu'elle documente une erreur de raisonnement plus utile que n'importe quelle réussite —
avoir pris un contournement efficace pour un diagnostic juste.

### 9.5 Coût de la méthode

Quinze revirements au total, dont trois pendant l'implémentation. Plusieurs auraient été évités
par une veille plus complète en amont : les concurrents directs et l'incompatibilité de Prisma
avec Go étaient l'un comme l'autre trouvables en quelques minutes.

En regard, la relecture systématique de chaque tâche a déclenché **six rondes de correction**
sur des constats jugés bloquants, corrigés avant de passer à la tâche suivante, et consigné
**dix défauts mineurs** triés en fin de jalon — aucun n'étant jugé bloquant pour la fusion.

La quasi-totalité de ces constats échappait à l'exécution des tests : ils portaient sur la
portée d'une correction, la forme d'une réponse d'erreur, un test qui vérifiait le mauvais
scénario, ou une protection affaiblie par inadvertance.

### 9.6 Suite

Le jalon M1 — événement, invitations, participants — reprend la même méthode : un plan écrit
avant le code, une migration, une démonstration à l'arrivée. Le déploiement en devient un
livrable, sa démonstration supposant une adresse publique.

---

## 10. Journal des révisions

| Date             | Modification                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| 8 septembre 2026 | Version initiale : veille, démarche, choix, revirements, conception                            |
| 8 septembre 2026 | Retour à Node, passage à Prisma 7, abandon de la contrainte `EXCLUDE` ; revirements 10 à 12    |
| 8 septembre 2026 | Section 6.11 : ce que l'installation réelle a démenti. Calendrier partagé avancé en M4         |
| 9 septembre 2026 | Jalon M0 livré et fusionné. Revirements 13 à 15, dont un revirement de revirement              |
| 9 septembre 2026 | Sections 7.7 et 7.8 : la vérification qui ne vérifie pas, le coût consigné d'une erreur        |
| 9 septembre 2026 | Section 9 réécrite : bilan du jalon M0 remplaçant le bilan intermédiaire de cadrage            |

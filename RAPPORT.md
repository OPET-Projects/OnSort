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
9. [Bilan intermédiaire](#9-bilan-intermédiaire)
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

### 3.2 Accès aux données

Nous avons examiné trois approches, sous un critère qui nous est propre : la requête
centrale du produit est un calcul d'intersection de créneaux temporels.

- **Prisma** — le plus complet, mais **aucun support des types intervalles de PostgreSQL**.
  Notre requête principale sortirait du modèle.
- **Drizzle** — proche du SQL, types personnalisés possibles, migrations intégrées.
- **Kysely** — constructeur de requêtes, excellente affinité avec le SQL brut, migrations à
  outiller séparément.

Ce critère unique a suffi à trancher. Il illustre un principe général : un outil ne
s'évalue pas dans l'absolu mais sur le point dur du problème traité.

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
| Back             | Deno 2 + Hono             | TypeScript natif, outillage intégré, types partagés avec le front |
| Base             | PostgreSQL 17             | Types intervalles et contraintes d'exclusion natifs               |
| Accès données    | Drizzle                   | Seul à traiter correctement notre requête centrale                |
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

---

## 7. Concepts informatiques mobilisés

### 7.1 Déléguer un invariant au système de gestion de base de données

Deux indisponibilités d'un même utilisateur ne doivent jamais se recouvrir. Cette règle peut
s'écrire dans le code applicatif — au risque d'être contournée par un chemin oublié — ou
être confiée à PostgreSQL :

```sql
EXCLUDE USING gist (user_id WITH =, period WITH &&)
```

La base refuse alors l'insertion, quel que soit le code appelant. Un invariant appliqué par
le système de stockage est structurellement plus fort qu'un invariant appliqué par
l'application, parce qu'il ne peut pas être oublié.

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
| M4    | Carte, géocodage                      | Le programme sur une carte                  |
| M5    | Groupes, calendrier partagé           | Le créneau qui convient à tous              |
| M6    | Amis, notifications                   |                                             |
| M7    | Finitions                             |                                             |

À l'issue de M3, le produit est cohérent et se défend seul.

---

## 9. Bilan intermédiaire

À ce stade, aucune ligne de code applicatif n'a été écrite, et c'est délibéré. La phase de
cadrage a produit trois documents versionnés et a permis d'identifier avant implémentation :

- **trois incompatibilités bloquantes** (Prisma/Go, Better Auth/Go, Deno/Vercel), qui
  auraient chacune coûté une réécriture ;
- **une erreur de catégorie** sur l'outil de recherche de lieux ;
- **cinq cas limites** de modélisation dont le traitement ne coûte rien s'il est prévu, et
  cher s'il est découvert après coup.

Le rapport sera complété au fil de l'implémentation : écarts entre la conception et le code
produit, décisions prises en cours de route, et bilan final.

---

## 10. Journal des révisions

| Date             | Modification                                                        |
| ---------------- | ------------------------------------------------------------------- |
| 8 septembre 2026 | Version initiale : veille, démarche, choix, revirements, conception |

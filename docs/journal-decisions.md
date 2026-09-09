# Journal des décisions

Arbitrages pris pendant la réalisation, souvent contre ce que le plan prévoyait. Chacun porte
son motif et **ce qu'il coûte s'il est mauvais** — ce dernier point permet de rouvrir une
décision sans rejouer tout le raisonnement.

Les décisions de conception, elles, sont dans [`decisions-techniques.md`](decisions-techniques.md).
Ce journal-ci ne couvre que ce qui a été tranché en cours d'implémentation.

---

## Une décision qui s'est révélée fausse

Elle vient en premier parce qu'elle est la plus instructive.

**Rétrograder Vite de 8.2.2 à 7.3.6** — *annulée*.

L'intégration continue échouait sous Linux sur `Cannot find native binding`. Diagnostic posé :
Vite 8 dépend de rolldown, qui embarque un binaire natif par plateforme, et le verrou npm
n'enregistrait que celui de la machine de développement. Trois contournements ont été testés et
écartés, puis Vite a été rétrogradé en 7, qui utilise esbuild et n'a pas de binaire natif.

**C'était faux.** Un test ultérieur, mené sur une copie du dépôt, a montré qu'une
réinstallation *vraiment* propre — en supprimant `node_modules` **et** le verrou — inscrit les
quinze variantes de plateforme, Linux comprise. Le test initial avait conservé `node_modules`,
et `npm install --package-lock-only` ne re-résout pas les dépendances optionnelles de
plateforme.

La cause était donc un verrou construit par ajouts successifs et jamais régénéré, pas Vite 8.
La rétrogradation a été annulée.

**Ce qu'on en retient** : un contournement qui fonctionne ne prouve pas que le diagnostic était
juste. Ici, changer de version faisait disparaître le symptôme sans toucher à la cause.

---

## Environnement et outillage

**Publier PostgreSQL sur le port hôte 5433.** Beaucoup de machines ont déjà un PostgreSQL sur
5432 ; celui-ci capte alors les connexions destinées au conteneur, d'où un `role "onsort" does
not exist` particulièrement trompeur. Écarté : arrêter le PostgreSQL de la machine, qui ne nous
appartient pas. La CI reste sur 5432, aucun conflit n'y existe. *Coût si erroné : un port à
changer dans deux fichiers.*

**Autoriser les imports terminés par `.ts` et les réécrire à l'émission.** Les sources emploient
ces spécificateurs pour rester exécutables directement par Node. Les deux options vont
ensemble : la première seule interdit toute émission. Vérifié avant décision, typage et
compilation. *Coût si erroné : deux options à revoir.*

**Le typage devient une porte de vérification obligatoire.** Il est resté cassé pendant cinq
tâches parce que seuls les tests étaient lancés. Corriger le symptôme sans fermer la porte
d'entrée l'aurait fait revenir. *Coût si erroné : quelques secondes par tâche.*

**Lancer les deux serveurs en parallèle dans le script `dev`.** `npm run <script> --workspaces`
s'exécute en séquence : le serveur d'API ne rendant jamais la main, le front ne démarrait
jamais. La commande documentée en tête du README était donc fausse. *Coût si erroné : une ligne
de script.*

**Charger `.env` explicitement dans la configuration de Vite.** Vite ne le charge pas dans
`process.env` pour son propre fichier de configuration : le port du mandataire n'était honoré
que si la variable avait été exportée dans le shell — ce que la vérification initiale faisait,
précisément. Une correction validée dans des conditions qui n'étaient pas celles de son usage.
*Coût si erroné : le mandataire reste sur le port par défaut.*

**Neutraliser `noUnusedVariables` pour les seuls fichiers `.vue`.** Biome n'analyse pas les
gabarits : toute liaison utilisée uniquement dans un `<template>` lui paraît morte, et sa
correction automatique supprimerait du code employé. La portée restreinte a été prouvée par un
test négatif — la règle se déclenche toujours sur un `.ts`. *Coût si laissé en l'état : deux
avertissements permanents, donc une accoutumance au bruit qui masquerait le prochain
signalement réel.*

**M1 : étendre la même neutralisation à `noUnusedImports`.** Les vues de M1 importent des
symboles utilisés seulement dans le `<template>` (`RouterLink`, un formateur de date). C'est
la même cause — Biome ne lit pas le gabarit — et le même remède, sur une règle voisine que
M0 n'avait pas rencontrée faute d'import de ce genre. *Coût si erroné : un import mort non
signalé dans un `.vue` ; les `.ts` restent couverts.*

---

## Modélisation et règles métier

**Aucun solde n'est stocké.** Formulation retenue à la place de « les dépenses sont
immuables ». Un solde est toujours dérivé des parts et des règlements ; un règlement est une
ligne indépendante. Plus simple, et protège le même invariant.

**Forme d'erreur uniforme `{ code, message, details }`**, `details` toujours présent, objet vide
quand il n'y a rien à dire. Corrigé tant qu'**une seule** route divergeait, plutôt qu'à dix.
*Coût si erroné : une forme de réponse à réajuster.*

**Gestionnaire d'erreur global plutôt que local.** Une panne de base produisait un 500 générique
hors forme uniforme. Un `try/catch` local n'aurait protégé qu'une route, et chaque route future
aurait recommencé à diverger. Il n'expose jamais de détail interne au client : le détail va au
journal. *Coût si erroné : un gestionnaire à retirer.*

**Une API injoignable vaut une session anonyme.** L'exception remontait dans la garde du routeur
et bloquait la navigation initiale : écran vide, alors qu'un refus explicite était correctement
traité. Un service indisponible ne doit jamais produire un état pire qu'un refus. *Coût si
erroné : un bloc de rattrapage à ajuster.*

**L'intergiciel de session ne place que `user` dans le contexte**, pas `session`. Le plan se
contredisait sur ce point ; aucun consommateur n'a besoin de la session complète. *Coût si
erroné : une ligne.*

**La limitation de débit est hors périmètre.** Deux documents de conception se contredisaient :
l'un l'exigeait, l'autre la classait parmi les recommandations retirées du cadre du cours. Le
retrait est confirmé et consigné. Elle redeviendra nécessaire dès que l'application sera exposée
publiquement. Le reste de la règle anti-énumération reste en vigueur. *Coût si erroné : une
protection à ajouter au jalon suivant, ce que la documentation dit désormais clairement.*

---

## Méthode

**Une preuve empirique plutôt qu'un contrôle d'outil.** Le plan prévoyait de valider les modèles
d'authentification avec la CLI de Better Auth, dans une version qui n'existe pas — l'outil
plafonne plusieurs versions en arrière du paquet principal. Remplacé par un test qui mène une
connexion complète et vérifie qu'un utilisateur et une session sont réellement créés. Preuve
plus forte qu'un écart de schéma calculé, et qui reste comme test de non-régression.

**Résoudre la sortie du service d'envoi au moment de l'envoi**, pas à la construction du
singleton. La référence figée rendait le service impossible à intercepter depuis l'aval, et
obligeait le test le plus important du jalon à un contournement couplé à un détail
d'implémentation. Corrigé bien que le défaut appartînt à une tâche antérieure : une dette de ce
genre ne se repaie jamais.

**Convention de langue.** Identifiants, noms de fichiers et messages de commit en anglais ;
textes lus par un humain — erreurs, journaux, interface, documentation — en français.

---

## Jalon M1 — événement, invitations, participants

**`GET /api/events` ajouté à la surface HTTP.** `conception.md` §5.1 ne listait pas de route
de liste, mais le tableau de bord §6.1 (« événements à venir ») en exige une. La liste rend
les événements où l'appelant est participant, triés par date. `conception.md` §5.1 a été
corrigé dans le commit qui introduit la route. *Coût si erroné : une route à retirer.*

**Aucune clé étrangère sur `invite_links.target_id` ni `invitations.target_id`.** Le modèle
de `conception.md` §2.6 est polymorphe (`scope event|group`). Une FK vers `events` aurait
cassé dès l'arrivée des invitations de groupe en M4. L'existence de la cible est vérifiée en
couche service, et la contrainte de base `event_id` sur `event_participants` reste la
dernière ligne. *Coût si erroné : une FK et une migration à ajouter.*

**Le lien d'une invitation nominative porte l'`id` de l'invitation comme jeton.** La table
`invitations` n'a pas de colonne jeton, par conception. `POST /api/invitations/:token/accept`
résout `:token` d'abord contre le hachage d'un `invite_links`, puis contre l'`id` d'une
`invitations` — l'identité de l'appelant (`invited_user_id` ou `invited_email`) étant alors
revérifiée. *Coût si erroné : un schéma de route à revoir, pas de migration.*

**La contrainte « une invitation vise un utilisateur ou une adresse » est un `CHECK` SQL
ajouté à la main** dans la migration `m1_events`, Prisma ne modélisant pas les `CHECK`. La
migration a été régénérée proprement (schéma reconstruit, `migrate deploy`) plutôt
qu'éditée après application, pour que sa somme de contrôle reste juste. *Coût si erroné :
une invitation vide acceptée en base ; le service la refuse déjà en amont.*

**Le courriel d'invitation part depuis le handler HTTP,** comme le lien magique de M0. La
file d'attente d'envoi reste une recommandation retirée (`decisions-techniques.md` §6). Un
échec d'envoi est journalisé et n'interrompt pas l'invitation, ni ne révèle l'état du compte
visé — la réponse est identique pour une adresse connue et inconnue (`conception.md` §4).
*Coût si erroné : un envoi perdu sans relance, à corriger par un `outbox` au passage en
production.*

**`requireSession` lève `ApiError` au lieu de renvoyer un JSON en ligne,** et un
gestionnaire `renderApiError` unique traduit `ApiError` comme les exceptions nues. Fait tant
qu'une seule route divergeait, comme la forme d'erreur uniforme de M0. Sortie identique pour
le client. *Coût si erroné : un intergiciel à réaligner.*

---

## Points laissés ouverts

- `api/prisma.config.ts` charge `../.env`, chemin relatif au **répertoire courant** et non au
  fichier. Une commande Prisma lancée depuis la racine échoue sur « Connection url is empty ».
  Les scripts npm ne sont pas affectés, la CI non plus. Correction propre : résoudre le chemin
  relativement au fichier de configuration.
- La branche d'envoi réel de courriel n'est couverte par aucun test : la tester exigerait un
  appel réseau ou une bibliothèque de simulation, tous deux exclus.
- Le parcours cliqué dans un navigateur et l'ergonomie au pouce à 375 px n'ont pas été validés
  automatiquement — ils demandent un humain.
- **Déploiement M1.** `conception.md` §9 et `decisions-techniques.md` §2.10 font du
  déploiement (URL publique + HTTPS) un livrable de M1. Le code est prêt ; la chaîne de
  livraison et l'accès au VPS restent à trancher.

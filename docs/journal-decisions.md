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

**La cible de retour du lien magique est absolutisée sur l'origine du front.** Better Auth
résout un `callbackURL` relatif contre sa propre `baseURL` : en développement, front (5173)
et API (3000) n'ayant pas la même origine, le lien magique atterrissait sur l'API, où aucune
page n'existe. M0 le documentait comme normal — le cookie était posé et il suffisait de
revenir sur le front. **M1 ne peut pas s'en contenter** : l'invité qui doit s'authentifier
perdait son invitation en chemin, ce qui est précisément la démonstration du jalon. Le front
envoie donc `new URL(chemin, window.location.origin)`. La cible reste vérifiée côté API
contre `trustedOrigins`, qui refuse toute autre origine par un 403 avant même l'envoi —
vérifié. En production, front et API partagent l'origine et le comportement est inchangé.
*Coût si erroné : une cible de redirection à recalculer, aucune migration.*

**Un compte créé par lien magique reçoit un nom dérivé de son adresse.** Le greffon
`magicLink` crée l'utilisateur sans nom, et aucun formulaire d'inscription n'en collecte :
tout compte non issu du jeu de données apparaissait donc comme une ligne vide dans la liste
des participants, et l'accueil affichait « Bonjour ». Corrigé **à la source**, par un
`databaseHooks.user.create.before`, plutôt que par un repli d'affichage dans chaque vue :
une seule règle, dont héritent tous les consommateurs présents et futurs. C'est une poignée
d'affichage, pas une identité déclarée ; un écran de profil la rendra modifiable.
*Coût si erroné : une règle de dérivation à changer, sans effet sur les comptes existants.*

**Rejoindre un événement passe par un `upsert`, pas par une lecture suivie d'une écriture.**
La version initiale lisait « suis-je déjà participant ? » puis insérait. Deux acceptations
simultanées — un double-clic — se croient alors toutes deux absentes, et la seconde
insertion heurte la contrainte d'unicité : l'appelant reçoit un 500. La contrainte protégeait
bien la donnée, mais pas l'utilisateur. Le test correspondant appelle le service directement
et non par HTTP : la pile HTTP intercale assez d'attentes pour que la course ne se produise
qu'au hasard, et un test qui n'échoue qu'une fois sur dix ne prouve rien. *Coût si erroné :
une instruction à réécrire.*

**`requireSession` lève `ApiError` au lieu de renvoyer un JSON en ligne,** et un
gestionnaire `renderApiError` unique traduit `ApiError` comme les exceptions nues. Fait tant
qu'une seule route divergeait, comme la forme d'erreur uniforme de M0. Sortie identique pour
le client. *Coût si erroné : un intergiciel à réaligner.*

---

## Jalon M2 — activités, vote, décision, temps réel

**`GET /api/events/:id/activities` ajouté à la surface HTTP.** §5.1 ne listait pas de route
de lecture du programme, mais §5.2 impose que le client « recharge la ressource concernée »
à réception d'un message. Sans route dédiée, il faudrait recharger l'événement entier à
chaque vote. §5.1 est corrigé dans le commit qui introduit la route. *Coût si erroné : une
route à retirer.*

**Quatre colonnes de `activities` et une table entière sont volontairement absentes.** §2.7
décrit le modèle **final** ; §9 dit *quand*, et `workflow.md` tranche — « on ne crée pas
aujourd'hui des tables que personne n'écrit encore ». Sont donc reportées : `lat`/`lng` en
M5 (géocodage), `attendance_mode` et la table `activity_absences` en M3 (présence),
`cancelled_at` en M7 (annulation). `address` est conservée dès M2 : c'est un champ libre
« où est-ce ? », utile sans géocodage. *Coût si erroné : quatre migrations d'une ligne, déjà
prévues.*

**Un vote référence une participation, pas un utilisateur.** C'est la clé primaire de §2.7.
Elle lie le vote à l'appartenance à l'événement — quitter l'événement emporte le vote — et
interdit le double vote sans une ligne de code. Le changement d'avis passe par un `upsert`
sur cette clé, ce qui le rend atomique. *Coût si erroné : une clé étrangère à changer.*

**Le bus SSE est un module à état, testé sans HTTP.** `lib/sse.ts` expose `subscribe` et
`publish` sur des fonctions ordinaires ; la route Hono n'en est qu'un adaptateur. Sans cette
séparation, tester le temps réel exigerait d'ouvrir des sockets. Un abonné qui lève est
journalisé et sauté : une connexion morte ne doit pas faire taire le flux des autres.
*Coût si erroné : un module à replier dans la route.*

**Modifier une activité est réservé à son proposant et aux administrateurs.** La matrice
§3.8 ne tranche pas ce cas ; retenu qu'on corrige sa propre proposition, et qu'un
administrateur puisse corriger celle d'un autre. *Coût si erroné : une condition à élargir.*

**La permission du flux est vérifiée avant l'ouverture du flux.** Une fois les en-têtes SSE
émis, on ne peut plus répondre par un code d'erreur : un non-participant recevrait un 200
suivi d'un flux vide. *Coût si erroné : un contrôle à déplacer.*

### Ce qu'une relecture de conformité a trouvé après coup

Le jalon a d'abord été déclaré fini alors qu'il débordait d'un côté et manquait de l'autre.
Les trois constats sont consignés parce qu'ils viennent tous d'une même cause : le plan
avait raisonné sur le périmètre des **routes**, jamais sur celui des **messages diffusés**.

**`PATCH /activities/:id` déborde de M2 — conservé, et §5.2 corrigée.** §9 range M2 sur
« activités, vote, SSE, décision » : la modification n'y figure pas, la démonstration ne
s'en sert pas. Le même raisonnement avait pourtant servi à écarter `attendance`, `cancel` et
`order` de la surface §5.1 — l'incohérence était de ne pas l'appliquer à `PATCH`. Décision
prise : garder la route, déjà écrite et testée, et **ajouter `activity.updated` à la liste
des types diffusés de §5.2**, qui ne l'admettait pas. Un message inventé sans corriger le
document est exactement ce que la règle d'autorité interdit. *Coût si erroné : une route et
un type à retirer ensemble.*

**`activity.created` n'était jamais diffusé.** §5.2 le liste, le front l'écoutait, et le
README affirmait qu'une activité proposée apparaît sur les deux écrans. C'était faux : la
proposition ne publiait rien. Aucun test ne l'a vu parce que le plan n'en demandait pas — il
faisait tester la diffusion du vote et de la décision, pas celle de la création.

**`participant.rsvp` n'était jamais diffusé** non plus, alors que la fonctionnalité existe
depuis M1 et que le flux existe depuis M2. Le front distingue désormais deux rechargements
ciblés : une réponse recharge l'événement, une activité recharge le programme. Recharger
l'un pour l'autre coûterait une requête pour rien et laisserait périmée la moitié qui a
bougé.

*Leçon retenue pour M3 : quand un jalon introduit un canal de diffusion, la liste des
messages de §5.2 est une liste de vérification au même titre que la surface HTTP de §5.1.*

---

## Jalon M3 — dépenses, parts, présence, soldes, règlements

Six arbitrages que la conception ne tranchait pas. Chacun porte son coût si la décision se
révèle mauvaise.

**Seuls les règlements confirmés entrent dans le solde.** §3.5 écrit « + transferts reçus −
transferts émis » sans distinguer `declared_at` de `confirmed_at`. Un règlement déclaré mais
non confirmé ne bouge donc aucun solde ; il apparaît à part, « en attente de confirmation ».
Motif : c'est la raison d'être des deux états de §3.6 — « celui qui doit ne pouvant pas
décider seul qu'il a payé ». Compter la déclaration rendrait le second état décoratif et
donnerait au débiteur le pouvoir d'effacer sa dette seul. *Coût si erroné : un filtre à
retirer dans `getBalances`.*

**`DELETE /api/settlements/:id` ajouté à la surface HTTP.** §5.1 ne liste que la déclaration
et la confirmation. Sans retrait, un virement déclaré par erreur — mauvais destinataire,
mauvais montant — reste éternellement en attente : le créancier ne peut ni le confirmer ni
le refuser, et la paire est bloquée. Aucun état de cette application n'a le droit d'être un
cul-de-sac. Le **débiteur** peut donc retirer sa propre déclaration **tant qu'elle n'est pas
confirmée** ; après, la ligne est définitive et se corrige par un virement inverse — un
règlement est un fait, pas un brouillon. §5.1 a été corrigée. *Coût si erroné : une route et
sa ligne de documentation à retirer ensemble.*

**`GET /api/events/:id/expenses` ajouté à la surface HTTP.** Même situation qu'en M2 pour les
activités : §5.1 liste la création mais pas la lecture, alors que §6.1 prévoit un écran qui
les affiche. La liste est ouverte à **tout** participant, y compris celui qui n'a pas
répondu — savoir ce que la sortie coûte fait partie de la décision de venir. *Coût si
erroné : une route à restreindre.*

**Modifier une dépense est réservé à son auteur et aux administrateurs.** §3.8 dit qui
*saisit* une dépense, pas qui la corrige. Aligné sur le précédent de M2 pour les activités,
et pour la même raison : une faute de frappe doit se réparer sans mobiliser un
administrateur, et un administrateur doit pouvoir réparer celle de quelqu'un qui a quitté la
conversation. *Coût si erroné : une condition à resserrer.*

**La modification d'une dépense recalcule ses parts.** §2.8 note 2 fige les parts « à la
saisie » contre les changements de **présence et de liste de participants** — pas contre la
correction de la dépense elle-même. Laisser les anciennes parts sur un nouveau montant
casserait l'invariant `SUM(parts) = montant`. La suppression et la réécriture partagent une
transaction : sans elle, un incident entre les deux laisserait une dépense sans aucune part,
ce qui se lit comme un solde faux et non comme une erreur. *Coût si erroné : une réécriture
à conditionner.*

**`attendance_mode` est porté par l'activité, pas par l'événement.** §3.4 dit que
« l'administrateur peut le changer à tout moment » sans nommer le porteur ; §2.7 le liste
dans les colonnes d'`activities`, et le commentaire de `schema.prisma` posé en M2 l'annonçait
sur cette table. La présence se raisonne par activité : on saute le musée, pas la sortie.
*Coût si erroné : une colonne à déplacer, avec sa migration.*

### Deux refus délibérés

**Se déclarer absent d'une activité en mode `all` répond 409, au lieu d'être ignoré.**
L'absence n'aurait aucun effet sur le partage : l'accepter en silence laisserait croire le
contraire à celui qui vient de cliquer.

**Confirmer deux fois un règlement répond 200, pas 409.** Deux clics sur un réseau lent sont
une situation normale ; la première date fait foi. La symétrie n'est qu'apparente avec le cas
précédent : ici le second appel ne ment sur rien, il ne change simplement rien.

### Ce que l'exécution a appris

**Le typage est resté cassé pendant trois commits.** Les portes étaient lancées enchaînées
par `&&` avec un `| tail -1` sur chacune : le code de sortie observé était celui de `tail`,
toujours nul, et l'échec de `tsc` passait inaperçu. C'est la répétition exacte de l'incident
consigné dans `CLAUDE.md` — « il est resté cassé pendant cinq tâches parce que seuls les
tests étaient lancés » — sous une forme nouvelle : la porte était bien lancée, c'est son
résultat qui était jeté. Les trois portes passent désormais par un script qui propage les
codes de sortie.

**La faute de typage elle-même est instructive.** `noUncheckedIndexedAccess` refuse
`creditors[0]` même sous un `while (creditors.length > 0)`. Retirer les deux têtes de liste
et remettre celle qui garde un reste fait du cas vide la condition d'arrêt de la boucle,
plutôt qu'un fait à réaffirmer au vérificateur.

## Ouvrir une invitation ne fait plus rejoindre

Jusqu'ici, cliquer un lien d'invitation créait la participation à l'insu de l'invité : la vue
appelait `accept` au montage, et rejoindre un événement était la conséquence silencieuse d'un
clic sur un lien reçu. L'invité découvrait l'événement **après** y être entré.

Désormais la page de l'événement s'affiche floutée derrière une popup, et rien n'est écrit
tant que l'invité n'a pas répondu.

**Nouvelle route `GET /api/invitations/:token`, ajoutée à §5.1.** Elle rend le titre, la
période, le prénom de l'organisateur et le nombre de participants — rien d'autre. La lecture
de l'événement, elle, reste refusée à un non-participant.

**L'aperçu est volontairement pauvre, et c'est une décision de sécurité.** Un lien
partageable circule sans contrôle. Rendre l'événement complet au porteur du jeton aurait
exposé `getEvent`, qui porte l'**adresse électronique** de chaque participant : n'importe qui
recevant le lien aurait lu les adresses de tout le groupe sans jamais rejoindre. *Coût si
erroné : des champs à ajouter, ce qui est le sens facile à corriger.*

**« Non merci » n'écrit rien.** Le lien reste utilisable, et l'invité qui change d'avis le
rouvre. Marquer l'invitation `declined` aurait été plus expressif, mais le service traite
ensuite une invitation refusée comme invalide : le refus serait devenu définitif, donc un
cul-de-sac — ce que les règles du projet interdisent. Tracer le refus supposerait d'abord de
rendre cet état réversible. *Coût si erroné : le refus n'est pas mesurable.*

**La popup pose la question une fois, avec les trois réponses du modèle.** *Je participe*,
*je ne sais pas encore*, *je ne peux pas* — les trois valeurs de `rsvp`. « Je ne sais pas »
n'est pas une absence de réponse : c'est l'état `invited`, qui dit à l'organisateur que la
question a été vue. Les trois font entrer dans l'événement, refus compris, faute de quoi un
refus serait indistinguable d'un lien jamais ouvert. Refuser renvoie toutefois à l'accueil :
ouvrir l'événement qu'on vient de décliner serait contradictoire, et le tableau de bord
suffit à y revenir. *Coût si erroné : une redirection à changer.*

**Une invitation nominative ne se clôt que sur un oui.** Sur « je ne sais pas » ou sur un
refus, elle reste `pending`. La passer à `declined` la rendrait invalide aux yeux du service,
et son destinataire ne pourrait plus jamais la rouvrir — un cul-de-sac. La réponse vit dans
la participation, pas dans l'invitation.

**Rejoindre porte la réponse, et §3.2 a été corrigée en conséquence.** La participation était
créée au statut `invited`, l'invité devant ensuite cliquer « Je participe » dans l'onglet
Participants. Cette seconde étape n'avait de sens que parce que le lien faisait entrer sans
rien demander : elle était le seul moment où quelqu'un consentait vraiment. La popup ayant
pris ce rôle, la garder revenait à poser deux fois la même question, et le bouton « Je
participe » n'avait plus rien à trancher — c'est le constat qui a déclenché ce changement.
Le RSVP garde tout son sens ensuite : changer d'avis dans un sens ou dans l'autre. *Coût si
erroné : une valeur par défaut à remettre.*

**`POST /events/:id/rsvp` accepte désormais `invited`.** Il ne connaissait que `accepted` et
`declined` : on pouvait quitter « à confirmer », jamais y revenir. C'était un état absorbant
à l'envers, contraire à la garantie de §3.1.

**Une invitation nominative apparaît « à confirmer », un lien partageable non.** La demande
initiale était que l'invité figure dans la liste dès l'invitation. Créer une participation à ce
moment-là était impossible dans un cas et interdit dans l'autre : impossible pour une adresse
sans compte, `EventParticipant` référençant un `user` ; interdit pour une adresse qui en a
un, car la liste aurait alors dit à l'organisateur quelles adresses sont inscrites — l'oracle
d'énumération que §4 proscrit.

La sortie retenue affiche l'**invitation** et non une participation. L'adresse vient de ce
que l'organisateur a tapé, elle s'affiche pareil dans les deux cas, et la liste est réservée
aux administrateurs — les autres participants n'ont pas à lire l'adresse de quelqu'un qui
n'est pas encore là. *Coût si erroné : un bloc d'interface à retirer.*

Le filtre porte sur la **participation** et non sur le statut de l'invitation : celle-ci
reste `pending` après un « je ne sais pas », si bien que trier par statut aurait affiché
l'invité deux fois, avec deux réponses contradictoires.

**Copier le lien d'invitation le dit.** Le geste ne produisait aucun retour visible : il
réussissait ou échouait dans le même silence. Un bandeau l'annonce en haut de l'écran, et la
copie elle-même passe par un repli — `navigator.clipboard` n'existe qu'en contexte sécurisé
et lève quand la permission est refusée, ce que le code précédent ne rattrapait pas.

**`alreadyMember` court-circuite la popup.** Rouvrir son propre lien une fois entré ouvre
directement l'événement : reposer la question ferait de la popup une porte à pousser chaque
jour.

**Le flou est décoratif, jamais une protection.** Le serveur n'envoie que le nécessaire ;
aucune donnée cachée ne se lit en désactivant un style. Le décor porte `aria-hidden`, un
arrière-plan illisible n'ayant aucun sens pour un lecteur d'écran.

## Jalon M4 — groupes, calendrier partagé, superposition

**Ajouter un membre par adresse passe par la machinerie d'invitation de M1.** §5.1 écrit
`POST /groups/:id/members`, ce qui se lirait « insère cette personne ». L'insertion directe
aurait répondu différemment selon que l'adresse a un compte ou non : l'oracle d'énumération
que §4 proscrit. La route crée donc une `Invitation` de `scope: 'group'` — la valeur déclarée
dès M1 « pour que le modèle polymorphe soit complet dès sa première migration », et dont M4
est le jalon qui s'en sert. On ne rejoint jamais un groupe sans l'avoir accepté. *Coût si
erroné : une route à simplifier.*

**Le chemin d'acceptation est devenu polymorphe.** `resolveViaLink` et `resolveViaInvitation`
filtraient sur `scope !== 'event'` ; ils rendent désormais `{ scope, targetId }`, et
l'acceptation crée soit une participation, soit une adhésion. L'aperçu suit : un groupe n'a
ni dates ni RSVP, la popup n'y propose donc que deux boutons.

**`GET /groups/:id/calendar` rend les occupations *et* les créneaux libres.** §2.4 ne décrit
que la superposition. Ne rendre que les occupations obligerait le front à calculer le
complément, donc à réécrire la règle des bornes semi-ouvertes — exactement l'endroit où un
`<` confondu avec un `<=` fabrique des conflits qui n'existent pas. Ne rendre que les
créneaux libres empêcherait de montrer qui bloque quoi. *Coût si erroné : un champ inutilisé
dans la réponse.*

**La fenêtre `from`/`to` est obligatoire et bornée à 90 jours.** Sans borne, un appel sur dix
ans lirait toute la table. Le refus porte un code distinct, `window_too_wide`, pour que
l'interface puisse proposer de réduire plutôt que d'afficher « requête invalide ».

**Les indisponibilités qui se touchent sont fusionnées, jamais rejetées** (§2.4,
`decisions-techniques` §2.3). L'écriture se fait dans une transaction avec verrou de ligne :
deux ajouts simultanés liraient sinon le même état, écriraient deux lignes disjointes, et
l'invariant de non-superposition tomberait — celui-là même que la contrainte `EXCLUDE`
écartée aurait garanti. C'est aussi la meilleure ergonomie, et l'interface le dit, faute de
quoi voir deux saisies devenir une ligne passerait pour un bogue.

**Supprimer une plage fusionnée supprime la plage résultante, pas la saisie d'origine.** La
fusion perd les frontières initiales : c'est le prix assumé de la décision précédente.

### Deux défauts corrigés au passage

**Les paramètres de requête ne passaient pas la frontière de validation.**
`schema.parse()` appelé dans une route lève une `ZodError` que le gestionnaire global traduit
en **500** : une fenêtre absente passait pour une panne du serveur alors que c'est la requête
qui est incomplète. `queryParams()` la traduit désormais en `400 validation_error`, comme
`jsonBody` le fait pour les corps.

**Un test d'affichage dépendait du fuseau horaire de la machine.** Une plage écrite en UTC
franchissait minuit à Paris, et l'assertion « deux heures dans la même journée » échouait
hors de GMT. Les instants des tests d'affichage se construisent maintenant en heure locale.

## Jalon M5 — carte, géocodage, pins ordonnés

**§2.6 affirmait à tort que l'OSMF interdit l'usage tiers de ses tuiles.** Vérification faite
contre la politique d'usage réelle, qui dit l'inverse — « We welcome creative uses and do not
require you to use a specific API ». L'usage est **conditionnel** : attribution visible,
`Referer` envoyé, cache respecté, aucun pré-chargement, et l'OSMF peut bloquer un usage qui
dégrade le service. La confusion venait probablement des conditions de Google, qui
interdisent bel et bien l'usage de leurs tuiles hors de leurs API. Conséquence : **aucune clé
n'est nécessaire**, et la démonstration ne dépend d'aucun compte tiers.

**Corollaire trouvé en corrigeant.** La façade posait `Referrer-Policy: same-origin`, qui
supprime l'en-tête `Referer` vers un autre domaine — donc vers le serveur de tuiles, qui s'en
sert pour identifier l'application. `strict-origin-when-cross-origin` envoie l'origine sans
le chemin : l'application est identifiée, et les jetons d'invitation qui voyagent dans les
chemins ne fuient pas davantage. Deux décisions se contredisaient sans que rien ne le
signale.

**La configuration des tuiles est servie par l'API, pas figée dans le front.** Une variable
`VITE_` serait inscrite dans l'image au moment du `docker build` : en changer demanderait de
reconstruire et de redéployer. `GET /api/map/config` la lit dans l'environnement du serveur,
l'image reste générique, et changer de fournisseur ne coûte qu'un redémarrage. *Coût si
erroné : une requête de plus au chargement de la carte.*

**Vide et absent valent tous deux « le défaut ».** `.default()` de zod ne couvre que
l'absence : un `MAP_TILES_URL=""` laissé dans un fichier d'exemple aurait empêché le
démarrage. L'attribution par défaut ne suit que la source par défaut — servir les tuiles d'un
fournisseur sous l'attribution d'un autre serait faux.

**`GET /api/places` et `GET /api/map/config` ajoutées à §5.1**, qui ne les prévoyait pas.
Les deux exigent une session : sans elle, l'application deviendrait un mandataire de
géocodage gratuit pour n'importe qui, sous notre identité auprès d'un service public — et
c'est nous qui serions bloqués.

**Un échec de géocodage n'échoue jamais l'enregistrement.** La BAN peut être lente,
indisponible, ou ne rien trouver. Perdre une saisie pour un service tiers serait le pire des
échanges : une activité sans coordonnées est valide, elle n'apparaît simplement pas sur la
carte.

**Un score minimal de 0,5 décide de ce qui est « trouvé ».** La BAN rend toujours quelque
chose. Un pin au mauvais endroit est pire qu'un pin absent, parce qu'il se croit vrai.

**Le géocodage ne se relance que si l'adresse a changé.** Sans cette garde, corriger un titre
appellerait un service public à chaque modification. Effacer l'adresse efface les
coordonnées, faute de quoi un pin resterait au dernier lieu connu d'une activité qui n'en a
plus.

### Ce que la vérification sur données réelles a appris

**La BAN géocode des adresses, pas des lieux.** « tour eiffel paris » ne marque que **0,38**,
sous le seuil : saisi tel quel, ce libellé ne produit aucun pin. C'est le comportement
attendu — §2.7 écarte explicitement la recherche de POI au MVP — mais il aurait été
déroutant sans l'autocomplétion, qui propose « Avenue Gustave Eiffel 75007 Paris » et fait
retenir ce libellé normalisé. **C'est l'autocomplétion qui rend le géocodage utilisable**,
pas un accessoire de confort.

**Une carte sans hauteur explicite est invisible sans erreur.** Leaflet mesure son conteneur
au montage ; un conteneur de hauteur nulle produit une carte vide et muette.

**`vi.spyOn` sur une méthode déjà espionnée rend le même espion, avec son historique.** Deux
assertions « n'a pas été appelé » ont échoué pour cette raison, sur du code correct. Le
`mockClear` est dans l'aide de test, commenté.

## Jalon M6 — amis et notifications

**Une notification est écrite puis diffusée, jamais seulement diffusée.** Le flux sert à
celui qui regarde, la table à celui qui revient. Diffuser sans écrire perdrait tout pour qui
n'était pas connecté — c'est-à-dire le cas courant. *Coût si erroné : une table à vider.*

**Le bus SSE gagne des salons personnels, pas un second bus.** `lib/sse.ts` indexait déjà par
une chaîne quelconque ; le préfixe `user:` empêche qu'un identifiant d'événement et un
identifiant d'utilisateur ne nomment le même salon. Un second bus aurait dupliqué la gestion
des abonnés et des connexions mortes.

**Le flux personnel prend son salon dans la session, jamais dans l'URL.** Écouter le flux de
quelqu'un d'autre n'est pas interdit : c'est **inexprimable**.

**Une notification qui échoue n'échoue pas l'action.** Perdre une dépense saisie parce
qu'une ligne d'information n'a pas pu s'écrire serait le pire des échanges.

**Demander quelqu'un en ami tombe sous la règle anti-énumération** (§4), pour la troisième
fois du projet après les invitations d'événement et de groupe. Demande créée, demande déjà en
attente, ou adresse sans compte : la réponse est la même, et dans les trois cas quelque chose
part — une notification, rien, ou un courriel d'invitation.

**Une demande croisée vaut acceptation.** Deux personnes qui se demandent mutuellement
veulent la même chose ; se heurter à une contrainte d'unicité serait absurde.

**Redemander ne renotifie pas.** Sans cette garde, recliquer relancerait le destinataire
autant de fois qu'on insiste. Une demande **refusée**, en revanche, se renouvelle : aucun
état n'est absorbant.

**Une action ne notifie jamais son auteur.** C'est le défaut le plus facile à introduire en
câblant sept déclencheurs, et le plus agaçant à l'usage. Chaque test vérifie **qui ne reçoit
rien** autant que qui reçoit.

**`activity.proposed` ne part qu'à ceux qui ont accepté.** C'est « la notification tu dois
voter » de §2.9 : les autres ne peuvent pas voter, la leur envoyer serait du bruit.

### Le défaut le plus coûteux du projet

**PostgreSQL et JavaScript ne comparent pas les chaînes de la même façon.** La contrainte
`friendships_ordered_pair` comparait deux identifiants avec la collation de la base,
`en_US.utf8`, dont l'ordre est **linguistique** : `'Z' < 'a'` y vaut **faux**, quand le même
test en JavaScript vaut **vrai**. Les identifiants de Better Auth mêlant majuscules et
minuscules, la base rejetait environ une fois sur deux le couple que `normalisePair` venait
de normaliser.

L'échec était **intermittent et déplacé** : il tombait sur un test différent à chaque
exécution, selon la casse d'identifiants tirés au hasard. Trois passages verts d'affilée
avaient failli me le faire classer sans suite ; c'est en le lançant huit fois de suite —
quatre échecs — que la cause est apparue.

`COLLATE "C"` compare octet par octet, exactement comme JavaScript sur de l'ASCII. Le piège
est consigné dans `CLAUDE.md` : il vaut pour **toute** contrainte qui ordonne des chaînes.

*Leçon : « ça ne se reproduit pas » n'est pas « c'est réglé ». Relancer en boucle coûte deux
minutes et donne la cause exacte.*

### Deux fautes de méthode à consigner

**Une porte lancée à travers un tube ne prouve rien.** `gates.sh | tail -4` rend le code de
sortie de `tail` : un typage cassé est passé et a été commité. C'est la **seconde** fois dans
ce projet, après l'incident de M3 — le piège est déjà dans `CLAUDE.md`, ce qui n'a pas suffi.
Le script n'affiche désormais que l'essentiel, pour qu'aucun filtrage ne soit tentant.

**`vi.spyOn` sur `console.info` fuit d'un test à l'autre sans `restoreAllMocks`**, et
`signIn` lit justement le lien magique dans cette sortie. L'échec apparaissait dans un test
qui n'avait rien fait de mal.

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
- **Le partage en pourcentage et en montant fixe reste sans interface.** L'enum `split_mode`
  porte les trois valeurs et le stockage est déjà identique dans les trois cas ; seul `equal`
  est proposé à la saisie. §9 range les deux autres en M7.
- **Aucun moyen de retirer un ami ni de bloquer quelqu'un.** §2.2 ne décrit ni l'un ni
  l'autre. Une amitié est aujourd'hui définitive.
- **Les notifications ne s'effacent pas.** Elles se marquent lues, la liste est bornée à
  cinquante, mais rien ne purge l'ancien.
- **La recherche de lieu par nom n'existe pas.** §2.7 l'écarte au MVP : Photon demande 8 à
  16 Go de RAM. L'autocomplétion d'adresse la remplace en pratique, mais chercher « le Louvre »
  ne marche pas — il faut une adresse.
- **`events.group_id` reste inutilisé.** Créer un événement depuis un créneau libre est la
  suite naturelle de M4, mais §9 borne le jalon à « groupes, calendrier partagé,
  superposition ». Le lien demande une décision de produit qui n'a pas été prise.
- **Un groupe ne se quitte pas, ne se renomme pas, et personne n'en est retiré.** §2.3 ne
  décrit que la table ; les gestes d'administration au-delà de l'invitation n'ont pas de
  spécification.
- **Un solde est recalculé à chaque lecture**, sans cache. C'est délibéré et non mesuré : les
  volumes d'une sortie entre amis ne le justifient pas. À reconsidérer seulement avec un
  profil sous les yeux.

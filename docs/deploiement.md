# Déploiement

Le déploiement est un **livrable du jalon M1** : `conception.md` §9 le rappelle, sa
démonstration — « un tiers rejoint un événement depuis son téléphone » — suppose une URL
publique et HTTPS.

La chaîne retenue est **Docker Compose**, derrière le **nginx déjà installé** sur le VPS, qui
termine le TLS. Le choix et ses écartés sont consignés dans
[`decisions-techniques.md`](decisions-techniques.md) §2.10.

## Ce qui tourne sur la machine

```txt
   internet
      │ :443 HTTPS
 ┌────▼──────────────────┐
 │  nginx (déjà présent) │  certificat, TLS
 └────┬──────────────────┘
      │ HTTP, 127.0.0.1:8080
 ┌────▼──────────────────────────────────┐
 │  pile Docker « onsort »               │
 │                                       │
 │   web  ──/api/*──►  api  ──►  db      │
 │    │                                  │
 │    └── /*  le front bâti, en statique │
 └───────────────────────────────────────┘
```

**Front et API sur la même origine.** Ce n'est pas un détail de confort : `EventSource` ne
permet pas d'envoyer d'en-têtes, l'authentification du flux SSE passe donc par le cookie de
session, ce qui impose la même origine (`conception.md` §5.2). En développement, les deux
ports diffèrent et le mandataire de Vite s'en charge ; en production, c'est le service `web`.

Ce service existe précisément pour ça. Sans lui, nginx devrait router `/api` d'un côté et des
fichiers statiques de l'autre — deux endroits où se tromper, et la règle de la même origine
tenue par une configuration hors du dépôt. Ici nginx n'a **qu'une seule cible** à connaître.

Un quatrième service, `migrate`, applique les migrations **avant** que l'API ne démarre, puis
s'arrête. Migrer depuis l'API elle-même ferait tourner la migration à chaque redémarrage et
noierait un échec dans une boucle de relance.

## Les étapes, dans l'ordre

Chacune est détaillée plus bas. Les six premières se font une fois ; ensuite le déploiement
est automatique.

| # | Étape | Où |
| --- | --- | --- |
| 1 | Champ `A` de `onsort.eliott-b.fr` vers le VPS | chez le registraire |
| 2 | Fusionner la branche de déploiement dans `main` | GitHub |
| 3 | Cloner le dépôt, copier et compléter `.env.production` | VPS |
| 4 | Démarrer la pile, vérifier la santé sur la boucle locale | VPS |
| 5 | Poser le bloc nginx, recharger | VPS |
| 6 | Vérifier par l'URL publique, **et le temps réel à deux écrans** | navigateur |
| 7 | Créer une paire de clés dédiée au déploiement | VPS et poste |
| 8 | Créer les secrets GitHub, lancer le workflow à la main une fois | GitHub |

## Premier déploiement

### 0. Préparer le domaine

Faire pointer un champ `A` de `onsort.eliott-b.fr` sur l'adresse du VPS, puis vérifier :

```sh
dig +short onsort.eliott-b.fr
```

Sans cette résolution, certbot ne pourra pas valider le domaine.

### 1. Préparer la machine

Le dépôt est cloné une fois à la main ; le déploiement automatique n'en fait ensuite que la
mise à jour.

```sh
ssh utilisateur@vps
git clone git@github.com:OPET-Projects/OnSort.git onsort
cd onsort
cp .env.production.example .env.production
```

### 2. Compléter les secrets

Sur le VPS, dans `.env.production`. Ce fichier ne quitte jamais la machine : il n'est ni
versionné, ni transmis par le déploiement.

```sh
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 32   # BETTER_AUTH_SECRET
```

| Variable | Valeur | Ce qui arrive si elle manque ou est fausse |
| --- | --- | --- |
| `APP_PUBLIC_URL` | `https://onsort.eliott-b.fr` | l'API refuse de démarrer. Une valeur fausse produit des liens magiques et des invitations qui ne mènent nulle part, et Better Auth rejette l'origine |
| `HTTP_PORT` | `8080` | défaut à 8080. À changer si le port est déjà pris sur la machine |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` | l'API refuse de démarrer |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`, 32 caractères au moins | l'API refuse de démarrer. Le changer plus tard invalide **toutes** les sessions ouvertes |
| `RESEND_API_KEY` | tableau de bord Resend | l'application tourne, mais les liens de connexion restent dans les journaux du conteneur : **personne ne peut se connecter à distance** |
| `MAIL_FROM` | `On Sort ? <no-reply@onsort.eliott-b.fr>` | l'API refuse de démarrer. Le domaine d'expédition doit être **vérifié chez Resend**, sinon les envois sont refusés |

Aucune de ces valeurs n'apparaît dans le dépôt, et aucune ne transite par GitHub.

### 3. Démarrer la pile

```sh
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
curl -fsS http://127.0.0.1:8080/api/health   # {"status":"ok"}
```

Tant que nginx n'est pas configuré, l'application n'écoute que sur la boucle locale. C'est
voulu : rien n'est joignable en clair depuis l'internet.

### 4. Configurer nginx

Le bloc est versionné, prêt à copier :
[`deploy/nginx/onsort.eliott-b.fr.conf`](../deploy/nginx/onsort.eliott-b.fr.conf).

```sh
sudo cp deploy/nginx/onsort.eliott-b.fr.conf /etc/nginx/sites-available/onsort
sudo ln -s /etc/nginx/sites-available/onsort /etc/nginx/sites-enabled/onsort
```

Renseigner les deux directives `ssl_certificate`, ou laisser certbot le faire :
`sudo certbot --nginx -d onsort.eliott-b.fr`.

Trois directives de ce fichier ne se devinent pas, et chacune casse quelque chose en
silence si on la retire :

| Directive | Ce qu'elle évite |
| --- | --- |
| `proxy_buffering off` | un flux SSE ne se ferme jamais, donc le tampon ne se vide jamais : le temps réel disparaît sans aucune erreur |
| `proxy_read_timeout 1h` | la coupure par défaut à 60 s ferme le flux sans cesse, et le client passe son temps à se reconnecter |
| `proxy_set_header X-Real-IP` | sans elle, Better Auth ne résout aucune adresse et limite les connexions dans un seau **partagé par tous les visiteurs** |

Puis `nginx -t && systemctl reload nginx`.

> **Le TLS doit être terminé quelque part.** Les cookies de session sont posés en `secure`
> dès que `NODE_ENV` vaut `production` (`api/src/auth.ts`) : un navigateur ne les renvoie pas
> sur du HTTP en clair. Servir l'application sans HTTPS produirait une connexion qui
> « fonctionne » jusqu'au rechargement suivant, où la session aurait disparu — le genre de
> panne qui coûte une soirée.

### 5. Vérifier

```sh
curl -fsS https://onsort.eliott-b.fr/api/health
```

Puis, dans un navigateur : demander un lien de connexion, le suivre, créer un événement.
Ouvrir le même événement sur deux appareils et voter : le décompte doit bouger sans
rechargement. C'est le seul test qui prouve que la mise en tampon de nginx est bien coupée.

Enfin, le contrôle des journaux décrit dans « Ce que Better Auth fait en production ».

## Déploiements suivants

Automatiques, **une fois les secrets créés**. Tant que la variable `APP_PUBLIC_URL` est
absente, le job est ignoré plutôt qu'échoué : un dépôt cloné sans VPS n'hérite pas d'une CI
rouge.

Le workflow `.github/workflows/deploy.yml` se déclenche **après** une CI verte sur `main` — pas sur le `push` lui-même, pour qu'un typage cassé ne parte pas en production.
Il se connecte en SSH, met le dépôt à jour, reconstruit, et **vérifie que l'application
répond par son URL publique** avant de se déclarer réussi : le relais nginx est donc éprouvé
à chaque fois, pas seulement le conteneur.

### Secrets et variables à créer dans GitHub

Dépôt → *Settings* → *Secrets and variables* → *Actions*.

| Nom | Type | Contenu |
| --- | --- | --- |
| `DEPLOY_SSH_KEY` | secret | clé privée d'une paire dédiée au déploiement, sans phrase de passe |
| `DEPLOY_HOST` | secret | nom ou adresse du VPS |
| `DEPLOY_USER` | secret | utilisateur SSH |
| `DEPLOY_PATH` | secret | chemin du dépôt sur le VPS, par exemple `/home/utilisateur/onsort` |
| `APP_PUBLIC_URL` | **variable** | `https://onsort.eliott-b.fr` |

Créer la paire de clés **pour ce seul usage** :

```sh
ssh-keygen -t ed25519 -C 'deploiement onsort' -f deploy_key -N ''
ssh-copy-id -i deploy_key.pub utilisateur@vps
```

La clé privée va dans `DEPLOY_SSH_KEY`, puis **le fichier local est détruit**. Réutiliser sa
clé personnelle donnerait à GitHub Actions tout ce que cette clé ouvre.

Aucun secret d'exécution ne transite par GitHub : `.env.production` reste sur le VPS.

## Exploitation

```sh
cd /chemin/onsort
alias prod='docker compose -f docker-compose.prod.yml --env-file .env.production'

prod ps                     # état des services
prod logs -f api            # journaux de l'API
prod logs -f web            # journaux d'accès
prod exec db psql -U onsort # console SQL
prod restart api
```

### Sauvegarde de la base

Aucune sauvegarde n'est automatisée : c'est un manque assumé, à combler si le projet dépasse
le cadre du cours.

```sh
prod exec -T db pg_dump -U onsort onsort | gzip > onsort-$(date +%F).sql.gz
```

### Jeu de données de démonstration

**Jamais en production sans y penser à deux fois** : `prisma/seed.ts` refuse de s'exécuter
quand `NODE_ENV` vaut `production`, précisément pour éviter de créer trois comptes de
démonstration sur une base réelle.

## Ce que Better Auth fait en production

Rien à configurer de plus : ces réglages sont dans `api/src/auth.ts` et prennent effet dès
que `NODE_ENV` vaut `production`. Ils sont listés ici parce qu'ils dépendent tous de la
façade, et qu'une erreur de proxy les annule sans bruit.

| Réglage | Valeur | Dépend de |
| --- | --- | --- |
| Secret de signature | `BETTER_AUTH_SECRET`, 32 caractères minimum vérifiés au démarrage | — |
| Origine de confiance | `APP_PUBLIC_URL` seule | l'URL publique doit être exacte |
| Cookies | `httpOnly`, `sameSite=lax`, **`secure`** | que le TLS soit terminé par nginx |
| Lien magique | 15 minutes, usage unique | — |
| Limite de débit | **3 requêtes par 10 s** sur `/api/auth/sign-in/*`, par adresse IP | `X-Real-IP` posé par nginx |

Deux conséquences à ne pas perdre de vue :

**Les cookies `secure` exigent le HTTPS.** Servir l'application en clair produirait une
connexion qui semble réussir, puis une session disparue au rechargement suivant — le
navigateur ne renvoie jamais un cookie `secure` sur du HTTP.

**La limite de débit exige `X-Real-IP`.** Derrière un mandataire, l'application ne voit que
l'adresse du mandataire. Sans en-tête de confiance déclarée, Better Auth n'en résout aucune
et retombe sur un seau unique par chemin : trois demandes de lien magique tous visiteurs
confondus, puis plus personne ne se connecte pendant dix secondes. L'application lit
`X-Real-IP` et non `X-Forwarded-For`, parce que nginx **écrase** la première alors que la
seconde est une liste à laquelle le client peut préfixer ce qu'il veut.

Le contrôle sur place :

```sh
prod logs api | grep -i "rate limiting could not determine"
```

Cette ligne ne doit jamais apparaître.

## Ce qui n'est pas fait

- **Aucune sauvegarde automatique.** Voir ci-dessus.
- **Un seul processus applicatif.** Le bus SSE vit en mémoire (`conception.md` §5.2) : passer
  à deux instances demanderait `LISTEN/NOTIFY`. Cohérent avec l'échelle visée.
- **Aucune supervision.** Ni métriques, ni alerte : le workflow vérifie que l'application
  répond au moment du déploiement, rien après.
- **Pas de bascule sans coupure.** `up -d --build` redémarre l'API ; l'interruption dure
  quelques secondes. Les flux SSE ouverts se rouvrent seuls côté client.

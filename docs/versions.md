# Versions et compatibilité

Relevé du 8 septembre 2026, vérifié sur les registres — voir la section 6 pour reproduire la
vérification.

## 1. Principe

Les versions sont **épinglées à l'exact**, sans `^` ni `~`, et les fichiers de verrouillage
sont versionnés. Sur un projet à plusieurs, une plage souple signifie que deux machines
n'installent pas la même chose et que le bogue n'apparaît que chez une personne.

Le critère de choix est la stabilité, pas la nouveauté : la dernière version stable, à
condition qu'elle soit acceptée par les contraintes déclarées des autres paquets.

## 2. Runtimes

|            | Version                  | Rôle                                         |
| ---------- | ------------------------ | -------------------------------------------- |
| Deno       | 2.9.6                    | Exécution de l'API                           |
| Node.js    | 24.20.0 (*Krypton*, LTS) | Outillage front, en développement seulement  |
| PostgreSQL | 17                       | Base de données (`postgres:17` en conteneur) |

Node 26.8.1 existe mais relève de la ligne *Current*, pas LTS.

**Node n'est pas déployé.** En production, le front est un dossier de fichiers statiques
servi par l'API ; seul Deno tourne sur le serveur.

## 3. Dépendances

### 3.1 API — `api/deno.json`

| Paquet                | Version |
| --------------------- | ------- |
| `hono`                | 4.13.7  |
| `@hono/zod-validator` | 0.9.1   |
| `zod`                 | 4.5.4   |
| `drizzle-orm`         | 0.45.2  |
| `drizzle-kit`         | 0.31.10 |
| `postgres`            | 3.4.9   |
| `better-auth`         | 1.7.3   |
| `resend`              | 6.26.0  |

### 3.2 Front — `web/package.json`

| Paquet               | Version |                                         |
| -------------------- | ------- | --------------------------------------- |
| `vue`                | 3.5.42  |                                         |
| `vue-router`         | 5.3.1   |                                         |
| `pinia`              | 4.0.3   |                                         |
| `@vue/devtools-api`  | 8.2.1   | peer de Pinia, à déclarer explicitement |
| `vite`               | 8.2.2   |                                         |
| `@vitejs/plugin-vue` | 6.0.8   |                                         |
| `tailwindcss`        | 4.3.3   |                                         |
| `@tailwindcss/vite`  | 4.3.3   | doit suivre `tailwindcss` à l'identique |
| `leaflet`            | 1.9.4   |                                         |
| `@types/leaflet`     | 1.9.22  |                                         |
| `typescript`         | 6.0.3   |                                         |
| `vue-tsc`            | 3.3.11  |                                         |
| `vitest`             | 5.0.0   |                                         |
| `@vue/test-utils`    | 2.5.0   |                                         |
| `hono`               | 4.13.7  | types seulement, voir section 5         |
| `zod`                | 4.5.4   | types seulement, voir section 5         |

## 4. Contraintes qui déterminent ces versions

Quatre dépendances imposent leur plage au reste de la pile.

| Contrainte déclarée                                                        | Conséquence                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `better-auth@1.7.3` : `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0`       | Drizzle reste en 0.45.2 ; la 1.0.0 n'existe qu'en `beta`, hors plage stable |
| `vitest@5.0.0` : engines `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`             | Node 24 LTS                                                                 |
| `vue-router@5.3.1` : `pinia ^3.0.4 \|\| ^4.0.2`, `vite ^7.3.0 \|\| ^8.0.0` | Pinia 4.0.3, Vite 8.2.2                                                     |
| `@hono/zod-validator@0.9.1` : `hono >=4.11.2`, `zod ^3.25.0 \|\| ^4.0.0`   | Hono 4.13.7, Zod 4.5.4                                                      |

### 4.1 Versions disponibles mais écartées

| Disponible                  | Retenu  | Raison                                                                                                                                                                      |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 7.0.2            | 6.0.3   | TS 7 est la réécriture native du compilateur. `vue-tsc@3.3.11` déclare `typescript >=5.0.0`, plage rédigée avant l'existence de TS 7 : elle l'autorise sans l'avoir éprouvé |
| Node 26.8.1                 | 24.20.0 | Ligne *Current*, pas LTS                                                                                                                                                    |
| `drizzle-orm` 1.0.0-beta.22 | 0.45.2  | Version bêta, et hors de la plage stable exigée par Better Auth                                                                                                             |
| `vue` 3.6.0-beta.17         | 3.5.42  | Version bêta                                                                                                                                                                |
| `zod` 3.x                   | 4.5.4   | Zod 4 est stable et accepté par le validateur Hono                                                                                                                          |

### 4.2 Avertissements attendus, sans conséquence

- `better-auth` déclare `vitest ^2 || ^3 || ^4` alors que le front utilise Vitest 5. Ce peer
  optionnel ne concerne que ses propres utilitaires de test, et Vitest vit dans un autre
  paquet.
- `better-auth` déclare `pg ^8`. Nous employons l'adaptateur Drizzle avec `postgres.js` ;
  ce chemin n'est pas emprunté.

## 5. La contrainte la plus importante n'est déclarée nulle part

Le front importe le type du routeur depuis le code de l'API, ce qui donne le typage
bout-en-bout sans génération de code. Deux mondes lisent donc le même fichier source : Deno
d'un côté, TypeScript sous Node de l'autre.

Un import à la mode Deno rend ce fichier illisible pour le front :

```ts
import { Hono } from "npm:hono@4.13.7"   // TypeScript sous Node ne sait pas résoudre ceci
```

**Solution : carte d'import côté Deno, spécificateurs nus dans le code source.**

```jsonc
// api/deno.json
{
  "imports": {
    "hono":        "npm:hono@4.13.7",
    "zod":         "npm:zod@4.5.4",
    "drizzle-orm": "npm:drizzle-orm@0.45.2"
  }
}
```

```ts
// api/src/main.ts — résoluble par les deux mondes
import { Hono } from "hono"
```

```jsonc
// web/tsconfig.json
{ "compilerOptions": { "paths": { "@api/*": ["../api/src/*"] } } }
```

Le front déclare `hono` et `zod` en dépendances de développement, pour les types uniquement ;
elles ne sont jamais empaquetées.

**Règle qui en découle** : les versions de `hono` et de `zod` doivent être **rigoureusement
identiques** des deux côtés. Une divergence produit deux définitions de type incompatibles et
une erreur de compilation difficile à interpréter. Toute mise à jour de l'une impose la mise
à jour simultanée de l'autre.

## 6. Revérifier

```sh
# dernière version publiée d'un paquet
curl -s https://registry.npmjs.org/hono | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['dist-tags'])"

# contraintes déclarées par une version précise
curl -s https://registry.npmjs.org/vitest/5.0.0 | \
  python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('peerDependencies'),d.get('engines'))"

# lignes LTS de Node
curl -s https://nodejs.org/dist/index.json | \
  python3 -c "import sys,json;print([(r['version'],r['lts']) for r in json.load(sys.stdin)[:40] if r['lts']][:3])"

# dernière version stable de Deno
curl -s https://dl.deno.land/release-latest.txt
```

## 7. Politique de mise à jour

- Une montée de version par commit, jamais groupée : une régression doit pouvoir être
  attribuée.
- Aucune montée vers une version `beta`, `rc` ou `next` pendant le projet.
- `hono` et `zod` se mettent à jour des deux côtés dans le même commit (section 5).
- Avant toute montée, vérifier les contraintes déclarées avec les commandes de la section 6.

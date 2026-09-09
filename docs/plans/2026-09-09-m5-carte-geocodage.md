# Jalon M5 — carte Leaflet, géocodage BAN, pins ordonnés

> **Pour un agent exécutant :** dérouler ce plan tâche par tâche, en TDD strict — écrire le
> test, le voir échouer, écrire le minimum, le voir passer, commiter. Les étapes sont des
> cases à cocher (`- [ ]`).

**But :** le programme d'un événement s'affiche sur une carte, les activités qui ont une
adresse portant un pin **numéroté dans l'ordre du programme**. C'est la démonstration de
M5 — « le programme sur une carte ».

**Architecture :** le géocodage se fait **côté serveur**, à l'enregistrement d'une adresse,
derrière une interface `PlaceSearch` qui isole le fournisseur (`decisions-techniques` §2.7).
La carte est un composant Vue qui instancie Leaflet à la main sur une `ref`, sans greffon
(§6.5). Aucune donnée de carte n'est stockée en dehors de `lat`/`lng`.

**Conception :** [`../conception.md`](../conception.md) — sections 2.7, 5.1, 6.1, 6.5, 9.
**Décisions :** [`../decisions-techniques.md`](../decisions-techniques.md) — §2.6 (Leaflet et
la source des tuiles), §2.7 (BAN, Photon et Overpass écartés).
**Jalon précédent :** [`2026-09-09-m4-groupes-calendrier-partage.md`](2026-09-09-m4-groupes-calendrier-partage.md).

## Contraintes globales

- Aucune montée de version. `leaflet@1.9.4` et `@types/leaflet` sont installés depuis M0 et
  restent inutilisés jusqu'ici : ce jalon est celui qui s'en sert.
- **Une migration par jalon.** M5 ajoute exactement deux colonnes : `activities.lat` et
  `activities.lng`.
- **Jamais `tile.openstreetmap.org`.** La fondation OSM interdit explicitement l'usage de ses
  serveurs par une application tierce (`decisions-techniques` §2.6).
- Portes avant **chaque** commit, **chacune lancée seule** : `npx biome check --write .`,
  `npm run typecheck`, `npm test`.
- **Ne jamais lancer la correction automatique de Biome sur un `.vue`.**
- **Forme d'erreur uniforme** `{ code, message, details }` via `ApiError`.
- Un appel réseau sortant ne doit **jamais** faire échouer l'enregistrement d'une activité.

## Périmètre

**Dans M5 :**

| Domaine | Contenu |
| --- | --- |
| Base | Colonnes `lat`, `lng` sur `activities`, migration `m5_coordinates` |
| Pur | `lib/places.ts` — lecture d'une réponse BAN, normalisation, seuil de confiance |
| Adaptateur | `lib/geocoder.ts` — appel HTTP à la BAN, derrière l'interface `PlaceSearch` |
| API | `GET /api/places?q=`, `GET /api/map/config` ; géocodage à la création et à la modification d'une activité |
| Front | `MapView.vue`, autocomplétion d'adresse dans le formulaire d'activité, onglet **Carte** |

**Hors M5 :**

| Écarté | Motif |
| --- | --- |
| Recherche de POI par nom | `decisions-techniques` §2.7 : Photon demande 8 à 16 Go de RAM, Overpass n'est pas un moteur de recherche. Le MVP a un champ « nom » libre et un champ « adresse » géocodé |
| Itinéraires, calcul de distance | Ne figure nulle part dans la conception |
| Géocodage des dépenses ou des groupes | §2.7 ne pose `lat`/`lng` que sur les activités |
| Tuiles vectorielles, `.pmtiles` | §2.6 les écarte : préparation de données injustifiée ici |

---

## Décisions de ce jalon à consigner

1. **La configuration des tuiles vient de l'API, pas du build du front.** Une clé de tuiles
   passée en `VITE_*` serait figée dans l'image au moment du `docker build` : la changer
   demanderait de reconstruire et redéployer, et la clé devrait exister sur la machine de
   construction. Une route `GET /api/map/config` la sert depuis l'environnement du serveur.
   L'image reste générique, la rotation de clé ne coûte qu'un redémarrage.
2. **`GET /api/places` et `GET /api/map/config` ajoutées à §5.1**, qui ne les prévoit pas.
3. **Le géocodage ne bloque jamais l'enregistrement.** La BAN peut être lente, indisponible,
   ou ne rien trouver. Une activité sans coordonnées est une activité valide — elle n'apparaît
   simplement pas sur la carte. Échouer sur ce point ferait perdre une saisie pour un service
   tiers.
4. **Un score de confiance minimal est exigé.** La BAN rend toujours un résultat, même très
   mauvais. En dessous du seuil, on n'enregistre pas de coordonnées : un pin au mauvais
   endroit est pire qu'un pin absent, parce qu'il se croit vrai.
5. **Sans clé de tuiles configurée, la carte est masquée** et l'onglet dit pourquoi. Afficher
   une carte grise sans explication ferait passer une configuration manquante pour un bogue.

---

## Tâche 1 : coordonnées en base

**Fichiers :** `api/prisma/schema.prisma`, migration `m5_coordinates`,
`api/tests/schema-m5.test.ts`.

- [ ] **Test qui échoue** : une activité accepte `lat`/`lng` nuls ; les deux ensemble ; une
      latitude hors de `[-90, 90]` ou une longitude hors de `[-180, 180]` est refusée.
- [ ] **Modèles** : `lat Float?` et `lng Float?` sur `Activity`.

> Ce sont les **seuls flottants** admis dans le projet. La règle « aucun flottant » vise le
> domaine financier (`CLAUDE.md`) ; une coordonnée géographique est une mesure, pas une
> somme, et aucune addition ne porte dessus.

- [ ] **Migration**, puis y ajouter avant première application :

```sql
ALTER TABLE "activities" ADD CONSTRAINT "activities_latitude_range"
  CHECK ("lat" IS NULL OR ("lat" >= -90 AND "lat" <= 90));
ALTER TABLE "activities" ADD CONSTRAINT "activities_longitude_range"
  CHECK ("lng" IS NULL OR ("lng" >= -180 AND "lng" <= 180));
-- Une coordonnée à moitié posée ne place rien : les deux colonnes vont ensemble.
ALTER TABLE "activities" ADD CONSTRAINT "activities_coordinates_paired"
  CHECK (("lat" IS NULL) = ("lng" IS NULL));
```

- [ ] Portes, commit.

---

## Tâche 2 : lecture d'une réponse BAN

**Fichiers :** `api/src/lib/places.ts`, `api/tests/lib/places.test.ts`.

**Interfaces :**

```ts
export type Place = {
  label: string
  lat: number
  lng: number
  score: number
}
export function parseBanResponse(body: unknown): Place[]
export function bestMatch(places: readonly Place[], minimumScore?: number): Place | null
```

- [ ] **Test qui échoue** — couvrir :
  - une réponse BAN réaliste (GeoJSON `FeatureCollection`) rend les points, `[lng, lat]`
    étant **inversé** par rapport à l'usage courant `lat, lng` ;
  - un corps vide, `null`, ou d'une forme inattendue rend `[]` sans lever ;
  - une entité sans coordonnées est ignorée plutôt que de produire un `NaN` ;
  - `bestMatch` rend `null` en dessous du seuil ;
  - `bestMatch` prend le meilleur score, pas le premier.

> **L'inversion des coordonnées est le piège du format.** GeoJSON ordonne `[longitude,
> latitude]`, Leaflet attend `[latitude, longitude]`. Les inverser place les adresses
> françaises quelque part en Somalie, et rien ne le signale.

- [ ] Implémentation, portes, commit.

---

## Tâche 3 : adaptateur BAN

**Fichiers :** `api/src/lib/geocoder.ts`, `api/tests/lib/geocoder.test.ts`.

**Interfaces :**

```ts
export type PlaceSearch = {
  search(query: string, limit?: number): Promise<Place[]>
}
export const geocoder: PlaceSearch
```

- [ ] **Test qui échoue** — la doublure de `fetch` est stubée :
  - une requête vide ou de moins de trois caractères ne part pas du tout ; la BAN les rejette
    et l'autocomplétion frappe à chaque touche ;
  - un statut non-2xx rend `[]` plutôt que de lever ;
  - un délai dépassé rend `[]` ;
  - l'URL appelée porte `q` et `limit`.

- [ ] **Implémentation.** `AbortSignal.timeout(3000)`, aucune clé, en-tête `User-Agent`
      identifiant l'application comme le demande l'usage des services publics.

> L'interface `PlaceSearch` existe pour permettre le basculement vers Photon ou un service
> tiers sans toucher au reste du code (`decisions-techniques` §2.7). Elle est le seul endroit
> du projet qui connaît la BAN.

- [ ] Portes, commit.

---

## Tâche 4 : géocoder à l'enregistrement

**Fichiers :** `api/src/modules/activities/service.ts`, `schema.ts`,
`api/tests/modules/geocoding.test.ts`.

- [ ] **Test qui échoue** — couvrir :
  - créer une activité avec une adresse enregistre `lat`/`lng` ;
  - une adresse vide ne géocode pas ;
  - un géocodage qui échoue **n'empêche pas** la création — l'activité existe sans
    coordonnées ;
  - modifier l'adresse regéocode ; modifier le seul titre ne déclenche aucun appel ;
  - effacer l'adresse efface les coordonnées, faute de quoi un pin resterait au dernier lieu
    connu d'une activité qui n'en a plus.
  - `listActivities` rend `lat`/`lng`.

- [ ] **Implémentation.** Le géocodage est enveloppé : un échec est journalisé, jamais levé.

- [ ] Portes, commit.

---

## Tâche 5 : routes de recherche et de configuration

**Fichiers :** `api/src/modules/places/{routes,schema}.ts`, `api/src/config.ts`,
`api/src/main.ts`, `api/tests/modules/places.test.ts`.

- [ ] **Test qui échoue** :
  - `GET /api/places?q=...` exige une session — sinon le service devient un mandataire de
    géocodage gratuit pour n'importe qui ;
  - une requête trop courte rend `{ places: [] }` sans appeler la BAN ;
  - `GET /api/map/config` rend `{ tilesUrl, attribution }`, et `tilesUrl` vaut `null` quand
    aucune clé n'est configurée ;
  - **la clé de tuiles n'apparaît jamais telle quelle** : elle est déjà substituée dans
    l'URL, et rien d'autre ne sort.

- [ ] **Configuration.** Deux variables : `MAP_TILES_URL` (avec un éventuel `{clé}` déjà
      inclus par l'exploitant) et `MAP_TILES_ATTRIBUTION`. À porter dans `.env.example`,
      `.env.production.example` et `docker-compose.prod.yml`.

- [ ] Portes, commit.

---

## Tâche 6 : la carte

**Fichiers :** `web/src/components/MapView.vue`, `web/src/composables/useMapConfig.ts`,
`web/src/views/EventView.vue`, `web/tests/map.test.ts`.

- [ ] **Test qui échoue** sur le composable : configuration chargée, absence de clé signalée.
- [ ] **`MapView.vue`** — Leaflet instancié dans `onMounted` sur une `ref`, `map.remove()`
      dans `onUnmounted`, **aucun greffon** (§6.5). Pins **numérotés** dans l'ordre du
      programme, cadrage automatique sur l'ensemble des points.

> Sans `map.remove()`, naviguer d'un événement à l'autre laisse une carte par événement
> visité, avec ses écouteurs et sa boucle d'animation.

- [ ] **Onglet Carte** dans `EventView.vue`, à côté de Programme, Participants et Dépenses.
      Masqué proprement quand aucune activité n'a de coordonnées, avec un mot d'explication ;
      masqué aussi, avec un mot différent, quand aucune clé de tuiles n'est configurée.
- [ ] Portes, commit.

---

## Tâche 7 : documentation

- [ ] `journal-decisions.md` : les cinq décisions ci-dessus, avec leur coût.
- [ ] `conception.md` §5.1 : les deux routes ajoutées.
- [ ] `CLAUDE.md` : état actuel, et l'exception « les coordonnées sont les seuls flottants ».
- [ ] `README.md` : la démonstration.
- [ ] `docs/deploiement.md` et les modèles d'environnement : les deux variables de tuiles.

## Vérification finale

- [ ] Les trois portes, `npm run build`.
- [ ] Démonstration : trois activités avec adresse, la carte les montre numérotées dans
      l'ordre du programme ; une activité sans adresse n'apparaît pas ; l'autocomplétion
      propose des adresses réelles à la frappe.
- [ ] **Vérifier de ses yeux qu'aucun pin n'est en Somalie** — c'est le symptôme de
      l'inversion `lat`/`lng`.

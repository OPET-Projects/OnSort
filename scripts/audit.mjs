// `npm audit`, mais utile : les avis connus, examinés et documentés (docs/versions.md §7), sont
// tolérés nommément ; tout autre avis fait échouer. Sans cette liste, l'audit affichait en
// permanence les mêmes alertes, et l'on apprenait à ne plus le lire — un nouvel avis se
// serait noyé dans l'ancien.

import { spawnSync } from 'node:child_process'

// Chaque entrée renvoie à son examen dans docs/versions.md §7. À retirer dès que l'avis
// disparaît de l'audit — le script le signale.
const KNOWN = new Map([
  ['GHSA-3f6p-5ww8-9rcr', 'mysql2 — peer optionnel inutilisé, projet sur PostgreSQL'],
  ['GHSA-rgwj-5xj2-c3m3', 'mysql2 — peer optionnel inutilisé, projet sur PostgreSQL'],
  ['GHSA-ggr8-5vv4-36mx', 'deepmerge-ts — fusion de notre propre configuration Prisma'],
])

const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8' })

let report
try {
  report = JSON.parse(run.stdout)
} catch {
  // Registre injoignable ou sortie inattendue : on échoue plutôt que de conclure à tort
  // qu'il n'y a rien.
  console.error('Audit impossible : la sortie de npm audit est illisible.')
  console.error(run.stderr)
  process.exit(1)
}

const found = new Map()
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via === 'object') {
      found.set(via.url.split('/').pop(), `${via.name} (${via.severity}) — ${via.title}`)
    }
  }
}

const unknown = [...found].filter(([id]) => !KNOWN.has(id))
const stale = [...KNOWN.keys()].filter((id) => !found.has(id))

for (const [id, reason] of KNOWN) {
  if (found.has(id)) {
    console.log(`toléré   ${id}  ${reason}`)
  }
}
for (const id of stale) {
  console.log(`corrigé  ${id}  n'est plus rapporté : le retirer de scripts/audit.mjs et de docs/versions.md §7`)
}
for (const [id, description] of unknown) {
  console.error(`NOUVEAU  ${id}  ${description}`)
}

if (unknown.length > 0) {
  console.error(
    `\n${unknown.length} avis non examiné(s). Les corriger, ou les examiner et les consigner dans docs/versions.md §7 avant de les ajouter à la liste.`,
  )
  process.exit(1)
}

console.log('\nAucun avis nouveau.')

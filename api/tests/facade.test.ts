import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// La façade de production (`Caddyfile`, embarquée dans l'image `web`) pose les en-têtes de
// sécurité de l'application. Aucun navigateur ne tourne en CI : ce test épingle le texte,
// pour qu'une protection ne disparaisse pas sans qu'une relecture le voie.
const caddyfile = readFileSync(new URL('../../Caddyfile', import.meta.url), 'utf8')

function header(name: string): string | undefined {
  const line = caddyfile
    .split('\n')
    .map((raw) => raw.trim())
    .find((raw) => raw.startsWith(`${name} `))

  return line?.slice(name.length + 1).replace(/^"|"$/g, '')
}

it('interdit l’intégration dans une page tierce', () => {
  expect(header('Content-Security-Policy')).toContain("frame-ancestors 'none'")
  expect(header('X-Frame-Options')).toBe('DENY')
})

it('applique dès maintenant les directives qui ne peuvent rien casser', () => {
  const enforced = header('Content-Security-Policy') ?? ''

  expect(enforced).toContain("object-src 'none'")
  expect(enforced).toContain("base-uri 'self'")
})

it('observe la politique complète avant de l’appliquer', () => {
  const observed = header('Content-Security-Policy-Report-Only') ?? ''

  expect(observed).toContain("default-src 'self'")
  expect(observed).toContain("script-src 'self'")
  // Les tuiles viennent d'un fournisseur configurable (`MAP_TILES_URL`).
  expect(observed).toContain('img-src')
  expect(observed).toContain('https:')
})

it('coupe les capacités du navigateur dont l’application ne se sert pas', () => {
  const policy = header('Permissions-Policy') ?? ''

  for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
    expect(policy).toContain(`${feature}=()`)
  }
})

it('ne pose Referrer-Policy qu’une fois', () => {
  expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
})

import { describe, expect, it } from 'vitest'
import { displayNameFromEmail } from '../../src/lib/identity.ts'

describe('displayNameFromEmail', () => {
  it('prend la partie locale de l’adresse', () => {
    expect(displayNameFromEmail('bob@example.test')).toBe('Bob')
  })

  it('sépare les mots et les capitalise', () => {
    expect(displayNameFromEmail('jean.dupont@example.test')).toBe('Jean Dupont')
    expect(displayNameFromEmail('marie_claire@example.test')).toBe('Marie Claire')
    expect(displayNameFromEmail('jean-luc@example.test')).toBe('Jean Luc')
  })

  it('ignore une étiquette d’adresse', () => {
    expect(displayNameFromEmail('jean.dupont+onsort@example.test')).toBe('Jean Dupont')
  })

  it('retombe sur l’adresse entière quand la partie locale ne donne rien', () => {
    expect(displayNameFromEmail('+++@example.test')).toBe('+++@example.test')
    expect(displayNameFromEmail('sans-arobase')).toBe('Sans Arobase')
  })

  it('borne la longueur', () => {
    const long = `${'a'.repeat(200)}@example.test`
    expect(displayNameFromEmail(long).length).toBeLessThanOrEqual(80)
  })
})

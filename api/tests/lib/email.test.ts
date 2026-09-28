import { describe, expect, it } from 'vitest'
import { renderEmail } from '../../src/lib/email.ts'

const content = {
  heading: 'Votre lien de connexion',
  paragraphs: ['Voici votre lien de connexion. Il expire dans quinze minutes.'],
  action: { label: 'Se connecter', url: 'https://onsort.test/api/auth/magic?token=abc' },
  note: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
}

describe('renderEmail — texte brut', () => {
  it('garde le lien sur sa propre ligne, lisible sans HTML', () => {
    const { text } = renderEmail(content)

    expect(text.split('\n')).toContain('https://onsort.test/api/auth/magic?token=abc')
    expect(text).toContain('Voici votre lien de connexion. Il expire dans quinze minutes.')
    expect(text).toContain("Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.")
  })

  it('ne contient aucune balise', () => {
    expect(renderEmail(content).text).not.toMatch(/<[a-z]/i)
  })
})

describe('renderEmail — HTML', () => {
  it('porte le lien dans un bouton et en clair, pour les clients qui bloquent les boutons', () => {
    const { html } = renderEmail(content)

    expect(html).toContain('href="https://onsort.test/api/auth/magic?token=abc"')
    expect(html).toContain('Se connecter')
    expect(html.split('https://onsort.test/api/auth/magic?token=abc').length).toBeGreaterThan(2)
  })

  it('reprend la couleur d’accent du site', () => {
    expect(renderEmail(content).html).toContain('#4f46e5')
  })

  it('échappe ce qu’un utilisateur a saisi', () => {
    const { html, text } = renderEmail({
      ...content,
      heading: 'Invitation à « <b>Soirée</b> »',
      paragraphs: ['Vous êtes invité·e à « <script>alert(1)</script> & "co" ».'],
    })

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Soirée</b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;')
    // Le texte brut n'est interprété par personne : il reste tel que saisi.
    expect(text).toContain('<script>alert(1)</script> & "co"')
  })

  it('échappe l’URL dans l’attribut', () => {
    const { html } = renderEmail({
      ...content,
      action: { label: 'Ouvrir', url: 'https://onsort.test/?a=1&b="x"' },
    })

    expect(html).toContain('href="https://onsort.test/?a=1&amp;b=&quot;x&quot;"')
  })
})

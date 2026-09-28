// Mise en forme des courriels : un contenu, deux rendus. Le texte brut reste la référence —
// c'est lui que lisent les clients qui refusent le HTML et le repli console — et le HTML
// reprend les jetons de `web/src/style.css`.
//
// Styles en ligne et mise en page par tableaux : la plupart des messageries ignorent
// `<style>`, les grilles modernes et les polices distantes. Aucune police n'est chargée —
// le projet auto-héberge la sienne pour ne rien demander à un tiers, et un courriel qui
// appellerait Google Fonts à l'ouverture ferait pire. La pile retombe sur la police système.

export type EmailContent = {
  heading: string
  paragraphs: string[]
  action: { label: string; url: string }
  note: string
}

const color = {
  canvas: '#fbfcfd',
  surface: '#ffffff',
  ink: '#10141c',
  ink2: '#475467',
  muted: '#667085',
  faint: '#8a94a6',
  line: '#e5e9f0',
  accent: '#4f46e5',
}

const font =
  "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Titres d'événement, noms de groupe et noms d'utilisateur sont saisis par des tiers : sans
// échappement, n'importe qui glisserait du balisage dans un courriel envoyé sous notre nom.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderEmail(content: EmailContent): { text: string; html: string } {
  return { text: renderText(content), html: renderHtml(content) }
}

function renderText({ paragraphs, action, note }: EmailContent): string {
  return ['Bonjour,', '', ...paragraphs, action.url, '', note].join('\n')
}

function renderHtml({ heading, paragraphs, action, note }: EmailContent): string {
  const url = escapeHtml(action.url)
  const body = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${color.ink2};">${escapeHtml(paragraph)}</p>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${color.canvas};font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(paragraphs[0] ?? heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.canvas};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background-color:${color.accent};border-radius:10px;color:#ffffff;font-size:18px;font-weight:700;line-height:34px;">?</td>
<td style="padding-left:10px;font-size:16px;font-weight:700;color:${color.ink};">On sort&nbsp;?</td>
</tr></table>
</td></tr>
<tr><td style="background-color:${color.surface};border:1px solid ${color.line};border-radius:18px;padding:32px;box-shadow:0 8px 24px rgba(16,24,40,0.08);">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.01em;color:${color.ink};">${escapeHtml(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${color.ink2};">Bonjour,</p>
${body}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
<td bgcolor="${color.accent}" style="background-color:${color.accent};border-radius:10px;">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(action.label)}</a>
</td>
</tr></table>
<p style="margin:0 0 6px;font-size:13px;line-height:20px;color:${color.muted};">Le bouton ne fonctionne pas&nbsp;? Copiez ce lien dans votre navigateur&nbsp;:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" style="color:${color.accent};text-decoration:none;">${url}</a></p>
<p style="margin:0;padding-top:20px;border-top:1px solid ${color.line};font-size:13px;line-height:20px;color:${color.muted};">${escapeHtml(note)}</p>
</td></tr>
<tr><td align="center" style="padding:20px 4px 0;font-size:12px;line-height:18px;color:${color.faint};">On sort&nbsp;? — l'organisation des sorties de groupe</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

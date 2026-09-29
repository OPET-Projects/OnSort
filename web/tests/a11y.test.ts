import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parse } from 'vue/compiler-sfc'

// Règles d'accessibilité vérifiées sur le texte des gabarits, sans navigateur : chaque
// contrôle doit avoir un nom qu'un lecteur d'écran puisse annoncer. Ce test ne remplace pas
// un passage au lecteur d'écran ; il empêche les oublis les plus courants de revenir.

const ELEMENT = 1
const TEXT = 2
const INTERPOLATION = 5
const ATTRIBUTE = 6
const DIRECTIVE = 7

type Prop = {
  type: number
  name: string
  value?: { content: string }
  arg?: { content: string }
  exp?: { content: string }
}

type Node = {
  type: number
  tag?: string
  content?: string | { content: string }
  props?: Prop[]
  children?: Node[]
  loc: { start: { line: number } }
}

const root = join(import.meta.dirname, '../src')
const files = ['views', 'components'].flatMap((dir) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.vue'))
    .map((name) => join(dir, name)),
)

// Valeur statique, ou `true` si l'attribut est lié dynamiquement (`:aria-label`).
function attribute(node: Node, name: string): string | true | undefined {
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === name) {
      return prop.value?.content ?? ''
    }
    if (prop.type === DIRECTIVE && prop.name === 'bind' && prop.arg?.content === name) {
      return true
    }
  }
  return undefined
}

function hasText(node: Node): boolean {
  if (node.type === TEXT) {
    return typeof node.content === 'string' && node.content.trim() !== ''
  }
  if (node.type === INTERPOLATION) {
    return true
  }
  // Le texte d'un SVG n'est pas un nom accessible fiable.
  if (node.tag === 'svg') {
    return false
  }
  return (node.children ?? []).some(hasText)
}

const named = (node: Node) =>
  attribute(node, 'aria-label') !== undefined || attribute(node, 'aria-labelledby') !== undefined

function labelTargets(node: Node, into: Set<string>): Set<string> {
  if (node.tag === 'label') {
    const target = attribute(node, 'for')
    if (typeof target === 'string') {
      into.add(target)
    }
  }
  for (const child of node.children ?? []) {
    labelTargets(child, into)
  }
  return into
}

function check(file: string): string[] {
  const { descriptor } = parse(readFileSync(join(root, file), 'utf8'))
  const ast = descriptor.template?.ast as unknown as Node | undefined
  if (ast === undefined) {
    return []
  }

  const forTargets = labelTargets(ast, new Set())
  const problems: string[] = []
  const report = (node: Node, rule: string) =>
    problems.push(`${file}:${node.loc.start.line} <${node.tag}> ${rule}`)

  function visit(node: Node, insideLabel: boolean) {
    if (node.type !== ELEMENT) {
      return
    }
    const tag = node.tag ?? ''

    if (
      (tag === 'button' || tag === 'a' || tag === 'RouterLink') &&
      !hasText(node) &&
      !named(node)
    ) {
      report(node, 'sans texte ni aria-label')
    }

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = attribute(node, 'type')
      const exempt = type === 'hidden' || type === 'submit' || type === 'button'
      const id = attribute(node, 'id')
      const byFor = typeof id === 'string' && forTargets.has(id)
      if (!exempt && !insideLabel && !named(node) && !byFor) {
        report(node, 'sans libellé')
      }
    }

    if (attribute(node, 'role') === 'dialog' && !named(node)) {
      report(node, 'dialogue sans nom')
    }

    if (tag === 'img' && attribute(node, 'alt') === undefined) {
      report(node, 'sans alt')
    }

    for (const child of node.children ?? []) {
      visit(child, insideLabel || tag === 'label')
    }
  }

  for (const child of ast.children ?? []) {
    visit(child, false)
  }
  return problems
}

it('trouve des gabarits à vérifier', () => {
  expect(files.length).toBeGreaterThan(10)
})

it('donne un nom accessible à chaque contrôle', () => {
  expect(files.flatMap(check)).toEqual([])
})

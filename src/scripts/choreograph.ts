/**
 * Playground choreography.
 *
 * The captured statements of each recipe's VERIFIED run (scripts/verify.mjs,
 * against a real Neo4j) are replayed as an animation: nodes pop into the
 * graph, generated Cypher streams into the inspector, steps land in the
 * results table. The editor is really editable — edits persist to the URL
 * hash — but execution replays the captured run of that recipe.
 */
import verify from '../lib/generated/verify.json'
import { quadEdge, type Box } from '../lib/graph-geometry'
import { highlightTS } from '../lib/highlight'

interface Statement {
  cypher: string
  params: Record<string, unknown>
  duration: number
}

interface RecipeResult {
  ok: boolean
  ms: number
  output: string
  error: string
  statements: Statement[]
}

interface RecipeData {
  id: string
  source: string
  result?: RecipeResult
}

// Raw recipe sources, bundled by Vite (?raw)
const sources = import.meta.glob('../content/cookbook/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export function loadRecipe(id: string): RecipeData {
  const source = sources[`../content/cookbook/${id}.ts`] ?? ''
  const result = (verify.results as Record<string, RecipeResult>)[id]
  return { id, source, result }
}

// ------------------------------------------------------------------ graph

interface GNode {
  key: string
  label: string
  name: string
  props: Array<[string, string]>
  x: number
  y: number
  seed?: boolean
  placed?: boolean
}

interface GEdge {
  from: string
  to: string
  type: string
}

type NodeTone = 'person' | 'movie' | 'other'

function toneOf(label: string): NodeTone {
  const l = label.toLowerCase()
  if (l === 'person' || l === 'student' || l === 'user') return 'person'
  if (l === 'movie') return 'movie'
  return 'other'
}

// Seeded demo graph — the Goodfellas cast and their other films. Keys use
// the content-key convention (`Label:display name`) so a node the code
// creates (CREATE (this:Movie { title: 'Goodfellas' })) gets its own node
// or dedupes onto a seeded one, and edges wire up by the same keys.
// Edge arrows follow the stored direction: (Person)-[:ACTED_IN]->(Movie).
function seedGraph(): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [
    {
      key: 'Person:Ray Liotta',
      label: 'Person',
      name: 'Ray Liotta',
      props: [
        ['name', 'Ray Liotta'],
        ['age', '40'],
      ],
      x: 80,
      y: 55,
      seed: true,
    },
    {
      key: 'Person:Robert De Niro',
      label: 'Person',
      name: 'Robert De Niro',
      props: [
        ['name', 'Robert De Niro'],
        ['age', '47'],
      ],
      x: 480,
      y: 40,
      seed: true,
    },
    {
      key: 'Person:Joe Pesci',
      label: 'Person',
      name: 'Joe Pesci',
      props: [
        ['name', 'Joe Pesci'],
        ['age', '48'],
      ],
      x: 560,
      y: 155,
      seed: true,
    },
    {
      key: 'Person:Martin Scorsese',
      label: 'Person',
      name: 'Martin Scorsese',
      props: [
        ['name', 'Martin Scorsese'],
        ['age', '47'],
      ],
      x: 260,
      y: 225,
      seed: true,
    },
    {
      key: 'Movie:Field of Dreams',
      label: 'Movie',
      name: 'Field of Dreams',
      props: [
        ['title', 'Field of Dreams'],
        ['released', '1989'],
      ],
      x: 110,
      y: 215,
      seed: true,
    },
    {
      key: 'Movie:Casino',
      label: 'Movie',
      name: 'Casino',
      props: [
        ['title', 'Casino'],
        ['released', '1995'],
      ],
      x: 410,
      y: 90,
      seed: true,
    },
    {
      key: 'Movie:The Irishman',
      label: 'Movie',
      name: 'The Irishman',
      props: [
        ['title', 'The Irishman'],
        ['released', '2019'],
      ],
      x: 540,
      y: 265,
      seed: true,
    },
  ]
  const edges: GEdge[] = [
    { from: 'Person:Ray Liotta', to: 'Movie:Field of Dreams', type: 'ACTED_IN' },
    { from: 'Person:Robert De Niro', to: 'Movie:Casino', type: 'ACTED_IN' },
    { from: 'Person:Joe Pesci', to: 'Movie:Casino', type: 'ACTED_IN' },
    { from: 'Person:Martin Scorsese', to: 'Movie:Casino', type: 'DIRECTED' },
    { from: 'Person:Robert De Niro', to: 'Movie:The Irishman', type: 'ACTED_IN' },
    { from: 'Person:Joe Pesci', to: 'Movie:The Irishman', type: 'ACTED_IN' },
    { from: 'Person:Martin Scorsese', to: 'Movie:The Irishman', type: 'DIRECTED' },
  ]
  return { nodes, edges }
}

// ---- captured-Cypher parsing (deliberately small: CREATE/MERGE/DELETE only)

function parseProps(raw: string | undefined, params: Record<string, unknown>): Array<[string, string]> {
  if (!raw) return []
  const out: Array<[string, string]> = []
  // k: 'literal' | k: "literal" | k: $param | k: 123
  const re = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|\$([\w]+)|(-?\d+(?:\.\d+)?))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const k = m[1]
    let v = m[2] ?? m[3] ?? m[5]
    if (m[4] !== undefined) {
      const p = params[m[4]]
      v = p === undefined ? undefined : String(p)
    }
    if (v !== undefined && v !== '') out.push([k, String(v)])
  }
  return out
}

function displayName(props: Array<[string, string]>, fallback: string): string {
  for (const key of ['name', 'title', 'slug', 'email']) {
    const hit = props.find(([k]) => k === key)
    if (hit) return hit[1]
  }
  return props[0]?.[1] ?? fallback
}

/** Reduce one captured statement to graph ops. */
function parseStatement(stmt: Statement): {
  isWrite: boolean
  isClear: boolean
  nodes: Array<{ v: string; label: string; props: Array<[string, string]> }>
  bareVars: string[]
  rels: Array<{ from: string; to: string; type: string }>
} {
  const cypher = stmt.cypher.replace(/\s+/g, ' ').trim()
  // `DELETE rel` (detach) only removes the edge; only a node DELETE clears.
  const deletesEdge = /\bDELETE\b/.test(cypher)
  const isClear = /\bDETACH DELETE\b/.test(cypher) || /\bDELETE\s+\w*(node|n)\b/.test(cypher)
  // MERGE may appear mid-statement after MATCHes — treat any CREATE/MERGE
  // keyword as a write
  const isWrite = /\bCREATE\b|\bMERGE\b/.test(cypher)
  const nodes: Array<{ v: string; label: string; props: Array<[string, string]> }> = []
  const bareVars: string[] = []
  const rels: Array<{ from: string; to: string; type: string; remove: boolean }> = []

  // Node patterns: (var:Label { props }) — vars may be absent: ()
  const nodeRe = /\((\w+)?\s*(?::`?([\w]+)`?)?\s*(\{[^}]*\})?\)/g
  let m: RegExpExecArray | null
  while ((m = nodeRe.exec(cypher))) {
    const [, v, label, propsRaw] = m
    if (!label) {
      // bare variable — (this), (from) — needed for cross-statement bindings
      if (v && !bareVars.includes(v)) bareVars.push(v)
      continue
    }
    nodes.push({ v: v || `#anon${m.index}`, label, props: parseProps(propsRaw, stmt.params) })
  }

  // Relationship patterns, with or without a relationship variable.
  // Outgoing: (a)-[:TYPE]->(b) · (a)-[r:TYPE]->(b)
  // Incoming: (a)<-[:TYPE]-(b) · (a)<-[r:TYPE]-(b) — the dash sits inside
  // the arrow on the incoming side, which the old `(<-)?-` shape never matched
  const relRe = /\((\w+)?\)\s*(<-|-)\s*\[(\w+)?\s*:`?(\w+)`?[^\]]*\]\s*(->|-)\s*\((\w+)?\)/g
  while ((m = relRe.exec(cypher))) {
    const [, a, dash1, , type, , b] = m
    const reversed = dash1 === '<-'
    const from = (reversed ? b : a) ?? ''
    const to = (reversed ? a : b) ?? ''
    if (from && to) rels.push({ from, to, type, remove: deletesEdge })
  }

  return { isWrite, isClear, nodes, bareVars, rels }
}

// ------------------------------------------------------------------ view

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface ChoreoOpts {
  mode: 'cell' | 'full' | 'static'
  recipe: string
}

export function choreograph(root: HTMLElement, opts: ChoreoOpts): void {
  const data = loadRecipe(opts.recipe)
  if (!data.source) return

  const svg = root.querySelector('svg[data-choreo-graph]') as SVGSVGElement | null
  const cypherBox = root.querySelector('[data-choreo-cypher]')
  const cypherList = root.querySelector('[data-choreo-cypher-list]')
  const runBtn = root.querySelector('button[data-choreo-run]') as HTMLButtonElement | null
  const runLabel = root.querySelector('[data-choreo-run-label]')
  const status = root.querySelector('[data-choreo-status]')
  const stepTable = root.querySelector('[data-choreo-steps]')
  const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-choreo-tab]'))
  const tabPanels = Array.from(root.querySelectorAll<HTMLElement>('[data-choreo-panel]'))
  const validationPanel = root.querySelector('[data-choreo-validation]')
  const shareBtn = root.querySelector('button[data-choreo-share]') as HTMLButtonElement | null
  const resetBtn = root.querySelector('button[data-choreo-reset]') as HTMLButtonElement | null
  const select = root.querySelector<HTMLSelectElement>('select[data-choreo-select]')
  const editor = root.querySelector<HTMLTextAreaElement>('textarea[data-choreo-editor]')

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let graph = seedGraph()
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  // Variable bindings across one run: `from` -> `Person:Adam` — lets a
  // MERGE in one statement draw its edge to nodes MATCHed in an earlier one
  const varBindings = new Map<string, string>()
  let createdOrder: string[] = []
  let freshVarCursor = 0
  const seenNodes = new Set<string>()

  const W = 640
  const nodeH: Record<NodeTone, number> = { person: 36, movie: 40, other: 36 }
  const nodeW: Record<NodeTone, number> = { person: 112, movie: 120, other: 112 }

  function layoutAdded(): void {
    // Place non-seed nodes in a loose grid below the seed cluster
    const added = graph.nodes.filter((n) => !n.seed)
    added.forEach((n, i) => {
      if (n.x !== undefined && n.placed) return
      const col = i % 4
      const row = Math.floor(i / 4)
      n.x = 60 + col * 150
      n.y = 280 + row * 70
      n.placed = true
    })
  }

  function renderGraph(): void {
    if (!svg) return
    layoutAdded()
    const parts: string[] = []

    // arrow marker
    parts.push(
      `<defs><marker id="pg-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--mute)"></path></marker></defs>`,
    )

    for (const e of graph.edges) {
      const a = graph.nodes.find((n) => n.key === e.from)
      const b = graph.nodes.find((n) => n.key === e.to)
      if (!a || !b) continue
      const box = (n: GNode): Box => ({ w: nodeW[toneOf(n.label)], h: nodeH[toneOf(n.label)] })
      const g = quadEdge(a, box(a), b, box(b))
      parts.push(
        `<g><path d="${g.path}" fill="none" stroke="var(--mute)" stroke-width="2" marker-end="url(#pg-arr)"></path>` +
          `<text x="${g.label.x}" y="${g.label.y}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--mute)" style="paint-order:stroke;stroke:var(--bg);stroke-width:3px">${esc(e.type)}</text></g>`,
      )
    }

    for (const n of graph.nodes) {
      const tone = toneOf(n.label)
      const w = nodeW[tone]
      const h = nodeH[tone]
      const fill = tone === 'movie' ? 'var(--blue)' : 'var(--amber)'
      const textFill = tone === 'movie' ? 'var(--onblue)' : 'var(--onnode)'
      // pop only on the node's FIRST appearance — re-rendering must not
      // restart the animation (fill:both keeps it at half-opacity otherwise)
      const isNew = !n.seed && !seenNodes.has(n.key)
      const pop = isNew ? `<g style="animation:pop .5s both;transform-box:fill-box;transform-origin:center">` : `<g>`
      const closePop = '</g>'
      seenNodes.add(n.key)
      parts.push(
        `<g transform="translate(${n.x - w / 2} ${n.y - h / 2})" style="cursor:pointer" data-choreo-node="${esc(n.key)}">` +
          pop +
          `<rect width="${w}" height="${h}" rx="10" fill="${fill}"></rect>` +
          `<text x="${w / 2}" y="${h / 2 + 4}" font-size="12" font-weight="700" text-anchor="middle" fill="${textFill}">${esc(n.name)}</text>` +
          closePop +
          `</g>`,
      )
    }

    const addedRows = Math.ceil(graph.nodes.filter((n) => !n.seed).length / 4)
    const vbH = 300 + Math.max(0, addedRows - 1) * 70
    svg.setAttribute('viewBox', `0 0 ${W} ${vbH}`)
    svg.innerHTML = parts.join('')

    svg.querySelectorAll<SVGGElement>('[data-choreo-node]').forEach((g) => {
      g.addEventListener('click', () => showProps(g.dataset.choreoNode ?? ''))
    })
  }

  function showProps(key: string): void {
    const panel = root.querySelector('[data-choreo-props]')
    if (!panel) return
    const n = graph.nodes.find((x) => x.key === key)
    if (!n) return
    panel.querySelector('[data-choreo-props-hint]')?.remove()
    const rows = [
      ['label', n.label],
      ...n.props.filter(([k]) => k !== 'id' || n.props.length < 4),
    ]
      .slice(0, 6)
      .map(([k, v]) => `<div style="display:flex;gap:14px;padding:3px 0"><span style="color:var(--mute);min-width:60px">${esc(k)}</span><span>${esc(v)}</span></div>`)
      .join('')
    panel.querySelector('[data-choreo-props-title]')!.textContent = `:${n.label}`
    panel.querySelector('[data-choreo-props-rows]')!.innerHTML = rows
  }

  const fmtMs = (ms: number): string => (ms >= 100 ? String(Math.round(ms)) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2))

  function renderSteps(): void {
    if (!stepTable || !data.result) return
    stepTable.innerHTML = data.result.statements
      .map(
        (s, i) =>
          `<tr data-choreo-step-row="${i}"><td style="padding:10px;border-top:1px solid var(--line)">${i + 1}</td>` +
          `<td style="padding:10px;border-top:1px solid var(--line);color:var(--text);font-size:12.5px">${esc(s.cypher.split('\n')[0].slice(0, 72))}${s.cypher.includes('\n') ? ' …' : ''}</td>` +
          `<td style="padding:10px;border-top:1px solid var(--line);color:var(--mute);white-space:nowrap">${fmtMs(s.duration)} ms</td></tr>`,
      )
      .join('')
  }

  function renderCypherList(): void {
    if (!cypherList || !data.result) return
    cypherList.innerHTML = data.result.statements
      .map(
        (s) =>
          `<div style="border:1px solid var(--line);border-radius:10px;background:var(--code);padding:10px 14px;font-size:12.5px;line-height:1.6"><div style="color:var(--text)">${esc(s.cypher)}</div><div style="color:var(--mute)">${esc(JSON.stringify(s.params).slice(0, 120))}</div></div>`,
      )
      .join('')
  }

  function renderValidation(): void {
    if (!validationPanel || !data.result) return
    const err = data.result.error
    if (!err) {
      validationPanel.innerHTML =
        '<div style="color:var(--mute)">This recipe\'s verified run had no validation failures. Try the <em>validation</em> recipe to watch Zod rules reject a write before it reaches the database.</div>'
      return
    }
    const lines = err.split('\n').filter((l) => l.trim())
    const title = lines[0]
    const rest = lines.slice(1).map((l) => `<div style="display:flex;gap:14px;padding:4px 0"><span>${esc(l.replace(/^- /, ''))}</span></div>`).join('')
    validationPanel.innerHTML = `<div style="border:1px solid var(--amber);border-radius:12px;padding:14px 16px;background:var(--bg)"><div style="color:var(--amber);font-weight:700;margin-bottom:8px">${esc(title)}</div>${rest}<div style="color:var(--mute);margin-top:10px">Captured from the verified build run — validation runs before any statement reaches the database.</div></div>`
  }

  function applyStatement(stmt: Statement): void {
    const { isWrite, isClear, nodes, bareVars, rels } = parseStatement(stmt)

    if (isClear) {
      graph = seedGraph()
      varBindings.clear()
      createdOrder = []
      freshVarCursor = 0
      seenNodes.clear()
      renderGraph()
      return
    }

    // Bind matched/created variables to content-keyed nodes, so a
    // `MATCH (from:Person …)` in one statement and a `MERGE (from)-[:OWNS]->(to)`
    // in the next resolve to the same node
    for (const n of nodes) {
      const name = displayName(n.props, n.label)
      const key = `${n.label}:${name}`
      if (isWrite) {
        if (!graph.nodes.some((g) => g.key === key)) {
          graph.nodes.push({ key, label: n.label, name, props: n.props, x: 0, y: 0 })
        }
        // A created node that dedupes onto an existing one (the demo seed's
        // The Matrix) still takes part in the creation order — later bare
        // MATCHes bind to it in that order
        if (!createdOrder.includes(key)) createdOrder.push(key)
      }
      if (n.v) varBindings.set(n.v, key)
    }

    // Bare (label-less) variables — `MATCH (from) WHERE elementId(from) = …` —
    // bind to nodes in creation order the first time each variable appears
    for (const v of bareVars) {
      if (!varBindings.has(v) && createdOrder.length > 0) {
        varBindings.set(v, createdOrder[freshVarCursor++ % createdOrder.length])
      }
    }

    for (const r of rels) {
      const from = varBindings.get(r.from)
      const to = varBindings.get(r.to)
      if (!from || !to) continue
      const dup = graph.edges.some((e) => e.from === from && e.to === to && e.type === r.type)
      if (r.remove) {
        // detach(): `MATCH (a)-[rel:T]->(b) … DELETE rel`
        graph.edges = graph.edges.filter((e) => !(e.from === from && e.to === to && e.type === r.type))
      } else if (!dup && from !== to) {
        graph.edges.push({ from, to, type: r.type })
      }
    }

    renderGraph()
  }

  function setTab(name: string): void {
    tabButtons.forEach((b) => b.setAttribute('aria-selected', b.dataset.choreoTab === name ? 'true' : 'false'))
    tabPanels.forEach((p) => (p.hidden = p.dataset.choreoPanel !== name))
  }

  function highlightRow(i: number): void {
    stepTable?.querySelectorAll('tr').forEach((tr, j) => {
      ;(tr as HTMLElement).style.background = j === i ? 'var(--surf2)' : ''
    })
  }

  async function run(): Promise<void> {
    if (running || !data.result) return
    running = true
    if (runBtn) runBtn.disabled = true
    if (runLabel) runLabel.textContent = 'Running…'

    graph = seedGraph()
    renderGraph()
    setTab('result')
    renderSteps()
    renderCypherList()
    renderValidation()

    const stmts = data.result.statements
    varBindings.clear()
    createdOrder = []
    freshVarCursor = 0
    seenNodes.clear()
    for (let i = 0; i < stmts.length; i++) {
      highlightRow(i)
      if (status) status.textContent = `step ${i + 1} of ${stmts.length}`
      applyStatement(stmts[i])
      if (cypherBox) {
        cypherBox.textContent = stmts[i].cypher
      }
      if (cypherList) {
        const cards = cypherList.querySelectorAll(':scope > div')
        cards[i]?.scrollIntoView({ block: 'nearest' })
      }
      if (!reduced) await new Promise((r) => setTimeout(r, 700))
    }

    if (status) status.textContent = `done — ${stmts.length} statements, verified in ${data.result.ms} ms`
    if (runLabel) runLabel.textContent = 'Run again'
    if (runBtn) runBtn.disabled = false
    running = false
  }

  function reset(): void {
    if (timer) clearTimeout(timer)
    running = false
    if (editor) setEditor(data.source)
    graph = seedGraph()
    varBindings.clear()
    createdOrder = []
    freshVarCursor = 0
    seenNodes.clear()
    renderGraph()
    renderSteps()
    if (cypherBox) cypherBox.textContent = '// Run to see the Cypher neode generated'
    if (status) status.textContent = ''
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search)
  }

  function share(): void {
    const code = editor ? btoa(unescape(encodeURIComponent(editor.value))) : ''
    const url = `${location.origin}${location.pathname}#recipe=${data.id}&code=${code}`
    history.replaceState(null, '', url)
    navigator.clipboard?.writeText(url).then(() => {
      if (shareBtn) {
        const old = shareBtn.textContent
        shareBtn.textContent = 'Copied ✓'
        setTimeout(() => shareBtn && (shareBtn.textContent = old), 1500)
      }
    })
  }

  // ---- editor: transparent textarea over a highlighted pre; keep them in
  // lockstep on input and scroll
  const editorWrap = editor?.closest('.ed-wrap')
  const editorHl = editorWrap?.querySelector('.ed-hl code') as HTMLElement | undefined
  const syncHighlight = (): void => {
    if (editor && editorHl) editorHl.innerHTML = highlightTS(editor.value)
  }
  const setEditor = (code: string): void => {
    if (!editor) return
    editor.value = code
    syncHighlight()
  }
  editor?.addEventListener('input', syncHighlight)
  editor?.addEventListener('scroll', () => {
    if (editorWrap && editorHl) {
      const pre = editorHl.closest('.ed-hl') as HTMLElement
      pre.scrollTop = editor.scrollTop
      pre.scrollLeft = editor.scrollLeft
    }
  })

  // ---- wire up
  // Restore a shared scene: #recipe=<id>&code=<base64>
  const hash = new URLSearchParams(location.hash.slice(1))
  const hashCode = hash.get('code')

  // Sync the UI to the recipe data (the page may have been rendered with a
  // different recipe than the URL asks for)
  if (editor && !hashCode) setEditor(data.source)
  const filename = root.querySelector('[data-choreo-filename]')
  if (filename) filename.textContent = `${data.id}.ts`

  // Static docs cell: no controls, no animation. Apply the whole captured
  // run once, then show the richest frame — the last statement is often the
  // cleanup (delete everything), which would render as nothing.
  if (opts.mode === 'static') {
    const stmts = data.result?.statements ?? []
    renderGraph()
    let best: { nodes: GNode[]; edges: GEdge[] } | undefined
    let bestScore = graph.nodes.length + graph.edges.length
    for (const s of stmts) {
      applyStatement(s)
      const score = graph.nodes.length + graph.edges.length
      if (score > bestScore) {
        bestScore = score
        best = { nodes: graph.nodes.map((n) => ({ ...n })), edges: graph.edges.map((e) => ({ ...e })) }
      }
    }
    if (best) {
      graph = best
      renderGraph()
    }
    return
  }

  renderGraph()
  renderSteps()
  renderCypherList()
  renderValidation()
  setTab('result')

  runBtn?.addEventListener('click', run)
  resetBtn?.addEventListener('click', reset)
  shareBtn?.addEventListener('click', share)
  tabButtons.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.choreoTab ?? 'result')))
  root.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  })

  function selectRecipe(nextId: string): void {
    if (nextId === data.id) return
    const next = loadRecipe(nextId)
    if (!next.source) return
    data.id = nextId
    data.source = next.source
    data.result = next.result
    running = false
    if (timer) clearTimeout(timer)
    if (editor) setEditor(next.source)
    if (filename) filename.textContent = `${nextId}.ts`
    graph = seedGraph()
    varBindings.clear()
    createdOrder = []
    freshVarCursor = 0
    seenNodes.clear()
    renderGraph()
    renderSteps()
    renderCypherList()
    renderValidation()
    setTab('result')
    if (cypherBox) cypherBox.textContent = '// Run to see the Cypher neode generated'
    if (status) status.textContent = ''
    if (runLabel) runLabel.textContent = 'Run'
    history.replaceState(null, '', `${location.pathname}?recipe=${nextId}`)
  }

  if (select) {
    select.value = data.id
    // in-place swap — no reload, no flash
    select.addEventListener('change', () => selectRecipe(select.value))
  }

  if (hashCode && editor) {
    setEditor(decodeURIComponent(escape(atob(hashCode))))
  }
}

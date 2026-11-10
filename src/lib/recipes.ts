import verify from './generated/verify.json'

export interface Statement {
  cypher: string
  params: Record<string, unknown>
  duration: number
}

export interface RecipeResult {
  ok: boolean
  ms: number
  output: string
  error: string
  statements: Statement[]
}

export interface Recipe {
  id: string
  title: string
  blurb: string
  source: string
  result?: RecipeResult
}

// Recipe metadata: titles and blurbs distilled from the cookbook headers
const META: Record<string, { title: string; blurb: string }> = {
  'bulk-import': {
    title: 'bulk-import',
    blurb: 'CSV/JSON rows into createMany()/mergeMany(): rowToProperties() maps and validates each row without throwing, batches stream with backpressure, re-runs merge instead of duplicating.',
  },
  quickstart: {
    title: 'quickstart',
    blurb: 'The four-step tour from the README — define a model, then create, find, update, delete.',
  },
  'crud-collection': {
    title: 'crud-collection',
    blurb: 'Full CRUD lifecycle: find by key and elementId, list, update, Collection and toJson serialisation.',
  },
  relationships: {
    title: 'relationships',
    blurb: "MERGE a relationship with edge properties, detach it, and see cascade 'delete' vs 'detach' on delete.",
  },
  'eager-read-models': {
    title: 'eager-read-models',
    blurb: 'Eager chains hydrated to depth, and @RelatedOne / @RelatedMany / @RelationshipCount projections in one query.',
  },
  validation: {
    title: 'validation',
    blurb: 'Zod-powered rules on properties; every failing check collected into one ValidationError before the write.',
  },
  'schema-sync': {
    title: 'schema-sync',
    blurb: 'installSchema() creates declared constraints and indexes; schemaDiff() reports drift; dropSchema() reverses.',
  },
  'search-fulltext-vector': {
    title: 'search-fulltext-vector',
    blurb: 'Full-text search with relevance scores and k-nearest-neighbour vector search over declared indexes.',
  },
  'run-all-and-transactions': {
    title: 'run-all-and-transactions',
    blurb: 'All-or-nothing batches with per-statement errors (runAll), and explicit transactions that commit or roll back as one.',
  },
  'multi-database': {
    title: 'multi-database',
    blurb: 'A default database plus per-call overrides — write an audit copy of a node to another database.',
  },
  'server-startup': {
    title: 'server-startup',
    blurb: 'The startup sequence every service wants: waitUntilReachable(), fromEnv(), installSchema(), then serve.',
  },
}

const sources = import.meta.glob('../content/cookbook/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const results = verify.results as unknown as Record<string, RecipeResult>

export const recipes: Recipe[] = Object.keys(META)
  .map((id) => {
    const key = `../content/cookbook/${id}.ts`
    return {
      id,
      ...META[id],
      source: sources[key] ?? '',
      result: results[id],
    }
  })

export function recipe(id: string): Recipe | undefined {
  return recipes.find((r) => r.id === id)
}

export const verifyMeta = {
  verifiedAt: verify.verifiedAt,
  backend: verify.backend,
  neo4jVersion: verify.neo4jVersion,
}

// Real ontologyMarkdown() output, captured by the build
export const ontologySample = (results as Record<string, { output?: string }>)['ontology-sample']?.output ?? ''

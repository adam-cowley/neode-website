/**
Quickstart — the four-step tour from the README, plus a relationship.

Define models with decorators, create nodes, relate them, then read the
relationship back eagerly in one statement. The website's home-page cell
and the playground's first recipe run exactly this file; the statements it
generates are captured at build time by scripts/verify.mjs.

Run:  NEO4J_URI=... NEO4J_USERNAME=neo4j NEO4J_PASSWORD=... \
      npx tsx examples/cookbook/quickstart.ts
*/
import { Direction, NodeEntity, OneToMany, Property, Uuid, fromEnv } from 'neode'

@NodeEntity()
export class Person {
  @Uuid({ primary: true })
  id: string

  @Property({ type: 'string', unique: true, required: true, min: 2, max: 50 })
  name: string

  @Property({ type: 'int' })
  age: number
}

@NodeEntity()
export class Movie {
  @Property({ type: 'string', unique: true, primary: true })
  title: string

  // direction 'in': the stored relationship is (Person)-[:ACTED_IN]->(Movie)
  @OneToMany(() => Person, 'ACTED_IN', { direction: 'in', eager: true })
  actors: Person[]
}

async function main(): Promise<void> {
  const neode = fromEnv()

  try {
    // CREATE — validated against the model before the write
    const ray = await neode.create(Person, { name: 'Ray Liotta', age: 40 })

    // READ — by primary key
    const found = await neode.find(Person, ray.id)

    // UPDATE, then relate: Ray Liotta ACTED_IN Goodfellas — the relationship
    // key is declared on the Movie model, so the relate runs from that side
    await neode.update(found, { age: 41 })
    const goodfellas = await neode.create(Movie, { title: 'Goodfellas' })
    await neode.relate(Movie, goodfellas, found, 'actors')

    // One eager read — the movie and its cast, hydrated in one statement
    const movie = await neode.find(Movie, goodfellas.title, { with: { actors: true } })
    console.log(`${movie?.title}: ${movie?.actors.length} actor(s) — ${movie?.actors[0]?.name}`)
  } finally {
    await neode.close()
  }
}

main().catch(console.error)

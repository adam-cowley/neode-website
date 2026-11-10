/**
Cookbook — batch import: file/API rows into createMany()/mergeMany().

Any source (CSV file, NDJSON stream, paginated API pull) is an
AsyncIterable of records. Feed batches as they arrive — `for await`
gives backpressure, memory stays bounded by the batch size, and each
batch commits its own transaction. rowToProperties() maps every row
through the model schema (renames, defaults, fakes, validation, type
conversion) without throwing, so bad rows are reported and good rows
still import. mergeMany() makes re-runs idempotent: matched rows update
instead of duplicating.

Run:  npx tsx examples/cookbook/bulk-import.ts
*/
import { NodeEntity, Property, Uuid, fromEnv, rowToProperties } from 'neode'

@NodeEntity()
class Product {
  @Uuid({ primary: true })
  id!: string

  @Property({ type: 'string', required: true, min: 2 })
  name!: string

  @Property({ type: 'number', min: 0 })
  price!: number
}

// Stand-in for a real source (createReadStream().pipe(csv-parse), NDJSON
// lines, paginated API pulls): an AsyncIterable of raw records, here a
// CSV body whose headers do not match the property names
async function* sourceRows(): AsyncIterable<Record<string, unknown>> {
  const csv = ['product_name,price', 'Kayak,799', 'Paddle,49.5', 'X,12']
  const [headers, ...lines] = csv.join('\n').split('\n')

  for (const line of lines) {
    yield Object.fromEntries(
      headers.split(',').map((header, index) => [header, line.split(',')[index] ?? '']),
    )
  }
}

async function main(): Promise<void> {
  const neode = fromEnv()

  try {
    const BATCH = 1000
    let batch: Record<string, unknown>[] = []
    const imported: Product[] = []
    const rejected: { row: Record<string, unknown>; errors: unknown }[] = []

    for await (const record of sourceRows()) {
      const mapped = await neode.rowToProperties(Product, record, {
        map: { product_name: 'name' },
      })

      if (mapped.ok) {
        batch.push(mapped.properties)
      } else {
        rejected.push({ row: record, errors: mapped.errors })
      }

      if (batch.length === BATCH) {
        const chunks = await neode.mergeMany(Product, batch)
        imported.push(...chunks.flatMap((chunk) => chunk.entities))
        batch = []
      }
    }

    if (batch.length > 0) {
      const chunks = await neode.mergeMany(Product, batch)
      imported.push(...chunks.flatMap((chunk) => chunk.entities))
    }

    console.log(`imported ${imported.length} rows, rejected ${rejected.length}`)

    for (const failure of rejected) {
      console.error(`rejected ${JSON.stringify(failure.row)}:`, failure.errors)
    }

    // Re-running the same file updates instead of duplicating (mergeMany
    // matches on the model's merge fields)
    for (const product of imported) {
      await neode.delete(product)
    }
  } finally {
    await neode.close()
  }
}

main().catch(console.error)

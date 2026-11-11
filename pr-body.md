docs: typed where filters keyed to the model's declared properties (neode NTS-646)

Documents the neode NTS-646 where-filter change: the `where` bags of `get` / `getFirst` / `first` / `all` / `paginate` / the Repository read methods take the typed `WhereFilter<C>` bag — equality values or operator objects (`{ age: { gte: 18 } }`) keyed to the model's declared properties, nested bags under relationship keys, mistyped keys rejected at compile time. Notes the keyset-pagination restriction (equality only) and the projection path's operator tier.

neode PR: https://github.com/adam-cowley/neode/pull/320
Linear: https://linear.app/neo4j/issue/NTS-646

# @easy-cms/db-sqlite

SQLite / libSQL (Turso) adapter for [Easy CMS](https://github.com/easy-cms/easy-cms).

```ts
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  db: sqlite({ url: 'file:./cms.db' }),
  // ...
})
```

| Option | Default | |
|---|---|---|
| `url` | — | `file:./cms.db` (relative to the project root) or `libsql://…` |
| `authToken` | — | For Turso / remote libSQL |
| `tablePrefix` | `ecms_` | Prefix of every table Easy CMS creates |
| `migrationDir` | `easy-cms/migrations` | Where migration files are written |

In-memory databases (`:memory:`) are not supported because transactions open a second connection.

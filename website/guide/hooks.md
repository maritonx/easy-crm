# Hooks

Hooks run your code at points of a document's life. They run for the Local API, the REST API and
the admin alike.

```ts
{
  slug: 'posts',
  hooks: {
    beforeChange: [
      ({ data }) => ({ ...data, readingTime: Math.ceil(countWords(data.body) / 200) }),
    ],
    afterChange: [
      async ({ doc, operation }) => {
        await fetch('https://example.com/revalidate', { method: 'POST', body: JSON.stringify({ slug: doc.slug }) })
      },
    ],
  },
  fields: [/* … */],
}
```

## Collection hooks

| Hook | Arguments | Return |
|---|---|---|
| `beforeValidate` | `data`, `operation`, `originalDoc?` | new data, or nothing |
| `beforeChange` | `data` (validated), `operation`, `originalDoc?` | new data, or nothing |
| `afterChange` | `doc`, `operation`, `previousDoc?` | — |
| `beforeDelete` | `id` | — |
| `afterDelete` | `id`, `doc` | — |
| `afterRead` | `doc` | new doc, or nothing |

Every hook also gets `user` (or `null`), `cms` (the Local API) and `slug`.

Globals support `beforeChange`, `afterChange` and `afterRead`.

## Order and errors

`beforeValidate` → validation → `beforeChange` → save → `afterChange`.

- A **before** hook that throws cancels the operation; the error reaches the caller.
- An **after** hook that throws is logged; the change stays saved.
- `afterRead` runs for every document returned, including populated ones, before hidden and
  unreadable fields are removed.
- Hooks in an array run one after another; each sees the previous one's result.

Hooks run outside the database transaction.

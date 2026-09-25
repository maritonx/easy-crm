# Access control

Access rules are functions in the config. They decide what the REST API (and so the admin UI)
lets each user do. The Local API trusts its caller and skips them unless you ask for them.

```ts
import { anyone, isAdmin, isLoggedIn } from '@easy-cms/core'

{
  slug: 'posts',
  access: {
    read: anyone,
    create: isLoggedIn,
    update: ({ user }) => user?.role === 'admin' || { author: { equals: user?.id } },
    delete: isAdmin,
  },
  fields: [/* … */],
}
```

## Rules

A collection has `read`, `create`, `update`, `delete`; a global has `read` and `update`.
Each receives `{ user, id?, data? }` (`user` is `null` when not logged in) and returns:

- `true` / `false`, or
- a **where query**: the operation is allowed for matching documents only. For `read` it filters
  results; for `update`/`delete` the document must match. `create` must return a boolean.

**If you define no rule, only logged-in users are allowed.** Make public content public on
purpose, e.g. `read: () => true`.

Helpers: `anyone`, `isLoggedIn`, `isAdmin`.

### Common patterns

```ts
// Visitors see published posts; editors see everything.
read: ({ user }) => (user ? true : { status: { equals: 'published' } }),

// Authors edit their own posts.
update: ({ user }) => (user?.role === 'admin' ? true : user ? { author: { equals: user.id } } : false),
```

## Field access

```ts
{ name: 'internalNotes', type: 'text', access: { read: ({ user }) => user !== null } }
{ name: 'featured', type: 'boolean', access: { update: ({ user }) => user?.role === 'admin' } }
```

Fields that can't be read are left out of responses; fields that can't be updated are ignored in
input (and shown read-only in the admin).

## Populated documents

When a response includes related documents, the related collection's `read` rule applies too:
documents the user can't read are not populated.

## In the Local API

```ts
const user = await useEasyCMSUser(event) // or getEasyCMSUser(config) in Next.js
await cms.find('posts', { overrideAccess: false, user })
```

Without `overrideAccess: false` the Local API does everything; it's for trusted server code.

## Built-in users collection

Logged-in users can read users; admins create and delete them; users update themselves but not
their own `role` or `active`. The last active admin can't be demoted, deactivated or deleted.

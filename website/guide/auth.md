# Users & auth

The built-in `users` collection holds the people who use the admin. They are separate from any
users your site has.

Fields: `email` (unique), `name`, `role`, `active`. Add your own by declaring a `users`
collection:

```ts
collections: [{ slug: 'users', fields: [{ name: 'phone', type: 'text' }] }]
```

## Roles

```ts
auth: { roles: ['admin', 'editor', 'author'] } // default: ['admin', 'editor']
```

`admin` must be one of them. Use `user.role` in [access rules](./access-control).

## Creating users

- The first admin: the admin UI asks for it when there are no users, or run
  `npx easy-cms create-admin`.
- Afterwards admins create users in the admin, or in code:

```ts
await cms.create('users', { email: 'ann@example.com', password: 'at least 8 chars', role: 'editor' })
```

Passwords are hashed with scrypt and never returned.

## Sessions

- `POST /api/cms/users/login` sets an HttpOnly session cookie (7 days by default,
  `auth.tokenExpiration` in seconds) and returns a CSRF token.
- Browsers send the cookie; writes must also send the token in `x-csrf-token`
  (see [REST API](./rest-api#authentication)).
- Other clients can send `Authorization: Bearer <token>` instead.
- Logging out, changing the password or deactivating a user ends their sessions.

After `auth.maxLoginAttempts` failures (5) within `auth.lockWindow` seconds (15 minutes) for an
email (and IP, when the adapter knows it), login answers `429`.

## In your pages

```ts
const user = await useEasyCMSUser(event) // Nuxt
const user = await getEasyCMSUser(config) // Next.js
```

Both return the logged-in admin user or `null`, e.g. to show draft previews to editors.

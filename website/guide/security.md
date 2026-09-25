# Security

What Easy CMS does for you:

- **Passwords** are hashed with scrypt (N=2¹⁷); session tokens are random, signed, and stored
  only as hashes.
- **Cookies** are HttpOnly, SameSite=Lax, and Secure in production.
- **CSRF**: cookie-authenticated writes need the session's CSRF token and a trusted Origin.
- **Login rate limiting** per email (and IP when known).
- **Access is closed by default**: without rules, only logged-in users can read or write.
- **Uploads** are checked by content, size-limited, renamed, and served with a sandboxing CSP.
- **Rich text rendering** escapes content and drops unsafe URLs.
- **Admin pages** send a strict Content Security Policy and `X-Frame-Options: DENY`.
- **Errors** hide details in production.

What you should do:

- Keep `EASY_CMS_SECRET` secret and long.
- Write access rules on purpose, especially `read`.
- Give editors the `editor` role, not `admin`.
- Keep migrations reviewed and dependencies updated.

Report vulnerabilities privately as described in
[SECURITY.md](https://github.com/maritonx/easy-crm/blob/main/SECURITY.md).

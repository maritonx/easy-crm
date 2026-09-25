# create-easy-cms

Adds [Easy CMS](https://github.com/maritonx/easy-crm) to a Nuxt or Next.js project.

```bash
npx create-easy-cms [dir] [--db sqlite|postgres] [--yes] [--skip-install]
```

Creates `easy-cms.config.ts`, adds `EASY_CMS_SECRET` to `.env`, updates `.gitignore`, wires the
Nuxt module or the Next.js route handlers and config, and installs the packages. Safe to run again.

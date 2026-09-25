# Easy CMS — Design Document

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25
- **ผู้เขียน:** Kanawoot K.
- **เวอร์ชันเป้าหมาย:** v0.1

---

## 1. สรุป

Easy CMS เป็น **Headless CMS แบบ embedded และ code-first** ที่ติดตั้งผ่าน npm แล้วฝังเข้าไปในแอปของลูกค้าที่มี server อยู่แล้ว
จุดต่างหลักคือ **รองรับทั้ง Nuxt (Vue) และ Next.js (React) อย่างเท่าเทียม** ขณะที่เครื่องมือแนวเดียวกันอย่าง Payload ผูกกับ Next.js อย่างเดียว

License MIT, ดูแลโดยนักพัฒนาคนเดียวแบบงานเสริม

## 2. ปัญหาและเป้าหมาย

**ปัญหา:** นักพัฒนาที่ใช้ Vue/Nuxt ไม่มี CMS แบบ embedded + code-first + type-safe ที่ดีพอ ต้องใช้ CMS แยก server (Strapi/Directus) หรือ SaaS (Contentful/Sanity)

**เป้าหมาย**
- `npx create-easy-cms` ในโปรเจกต์ Nuxt หรือ Next ที่มีอยู่แล้ว ได้หน้า `/admin` ที่ login ได้ภายใน 2 นาที
- นิยาม content ด้วย TypeScript และได้ types ไปใช้ฝั่งหน้าเว็บทันที
- Editor ที่ไม่ใช่สายเทคนิคใช้หน้า Admin ได้ (TH/EN)

**ไม่ใช่เป้าหมาย (v0.1)**
- UI สำหรับสร้าง content type แบบลากวาง
- GraphQL, Edge runtime, localization ของ content, version history
- บริการ SaaS / hosting

## 3. ผู้ใช้

| กลุ่ม | ทำอะไร | ต้องการอะไร |
|---|---|---|
| **Developer** | ติดตั้ง, เขียน config, deploy | ตั้งค่าง่าย, type-safe, ไม่ผูกกับ framework |
| **Editor** | กรอกและเผยแพร่ content | หน้า Admin ใช้ง่าย, มีภาษาไทย, มี draft ก่อน publish |

## 4. สถาปัตยกรรม

```
┌──────────────────── แอปลูกค้า (Nuxt / Next) ────────────────────┐
│                                                                 │
│  หน้าเว็บ ──► Local API: cms.find('posts')   (server-side)      │
│  Browser ──► REST: /api/cms/posts                               │
│  Editor  ──► /admin  (Vue SPA ที่ build มาพร้อม package)        │
│                    │                                            │
│        @easy-cms/nuxt  |  @easy-cms/next   (adapter บางๆ)       │
│                    │                                            │
│             @easy-cms/core                                      │
│   handler(Request) => Response · config · access · hooks        │
│                    │                                            │
│        Drizzle ─► SQLite / Postgres (ตาราง prefix ecms_)        │
│        Storage ─► Local disk / S3-compatible                    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Core เป็น Web-standard handler
`@easy-cms/core` เปิด handler ตามมาตรฐาน Web `(Request) => Promise<Response>` และ Local API
Adapter มีหน้าที่แค่ต่อ route ของ framework เข้ากับ handler และส่ง instance ของ CMS เข้า server context → ดู [ADR-0001](adr/0001-embedded-web-standard-core.md)

### 4.2 Admin UI
เขียนด้วย Vue 3 + Vite, build เป็น static SPA และเสิร์ฟที่ `/admin` ใช้ได้เหมือนกันทั้งใน Nuxt และ Next → ดู [ADR-0002](adr/0002-prebuilt-vue-admin-spa.md)

### 4.3 โหมด Standalone (v0.2)
`easy-cms serve` ห่อ core ด้วย Node HTTP server สำหรับลูกค้าที่ใช้ Vite SPA ล้วน

## 5. Packages

| Package | หน้าที่ | v0.1 |
|---|---|---|
| `@easy-cms/core` | config, handler, Local API, access, hooks, validation | ✅ |
| `@easy-cms/admin` | Vue SPA ที่ build แล้ว | ✅ |
| `@easy-cms/nuxt` | Nuxt module | ✅ (ทำก่อน) |
| `@easy-cms/next` | Next.js adapter (App Router, `runtime = 'nodejs'`) | ✅ |
| `@easy-cms/db-sqlite` | Drizzle + SQLite | ✅ |
| `@easy-cms/db-postgres` | Drizzle + Postgres | ✅ |
| `@easy-cms/richtext` | `renderRichText()` แปลง Tiptap JSON → HTML | ✅ |
| `@easy-cms/storage-s3` | S3 / R2 / MinIO | v0.2 |
| `easy-cms` (bin) | CLI | ✅ |
| `create-easy-cms` | ตัว scaffold | ✅ |

Repo: **pnpm workspaces + Turborepo + Changesets**

```
easy-cms/
├── packages/   core, admin, nuxt, next, db-sqlite, db-postgres, richtext, cli, create-easy-cms
├── examples/   nuxt-blog, next-blog   (ใช้เป็น fixture ของ E2E ด้วย)
└── docs/       VitePress (ภาษาอังกฤษเป็นหลัก)
```

## 6. Config (Code-first)

```ts
// easy-cms.config.ts
import { defineConfig, isAdmin } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET!,
  db: sqlite({ url: 'file:./cms.db' }),   // หรือ postgres({ url, tablePrefix: 'ecms_' })
  admin: { path: '/admin', locale: 'th' },
  collections: [
    {
      slug: 'posts',
      drafts: true,
      access: {
        read: ({ user, doc }) => doc?.status === 'published' || !!user,
        create: isAdmin,
        update: isAdmin,
      },
      hooks: {
        afterChange: [async ({ doc }) => { /* revalidate path */ }],
      },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title' },
        { name: 'cover', type: 'upload' },
        { name: 'body', type: 'richText' },
        { name: 'author', type: 'relationship', to: 'users' },
      ],
    },
  ],
  globals: [
    { slug: 'site', fields: [{ name: 'siteName', type: 'text' }] },
  ],
  plugins: [],
})
```

**Field types (v0.1):** `text, textarea, number, boolean, date, select, slug, email, json, richText, upload, relationship, array, group`

## 7. Data layer

- **ORM:** Drizzle, ประกาศ schema อัตโนมัติจาก config → ดู [ADR-0003](adr/0003-drizzle-sqlite-postgres.md)
- **DB:** SQLite (dev), Postgres (prod) ส่วน MySQL พิจารณาภายหลัง
- **DB ร่วมกับแอปลูกค้า:** ใช้ DB เดียวกันเป็น default และทุกตารางมี prefix `ecms_` (เปลี่ยนได้) Migration ของ Easy CMS แตะเฉพาะตารางที่มี prefix
- **Migration:**
  - Dev: sync schema อัตโนมัติ (push)
  - Prod: ใช้ migration files ที่ commit ลง git (`easy-cms migrate:create`, `easy-cms migrate`)
  - ถ้าพบ schema drift บน prod → แจ้ง error และ **ไม่** push อัตโนมัติ
- **เผื่อ v2:** ออกแบบ schema ให้เพิ่ม version history และ localization ภายหลังได้โดยไม่ต้องรื้อโครงสร้าง
- **รูปแบบตาราง:** collection → `ecms_<slug>`, array และ hasMany → ตารางลูก `ecms_<slug>__<field>`, globals → JSON ใน `ecms_globals`, ID เป็น integer, ไม่ใช้ foreign key → ดู [ADR-0005](adr/0005-storage-layout.md)
- **Migration files:** `easy-cms/migrations/<timestamp>_<name>.sql` + `.json` ตอน production ตรวจด้วย hash ของ schema

## 8. API

| ชั้น | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|
| **Local API** | Server-side ใน Nuxt/Next | `await cms.find('posts', { where: { status: 'published' } })` |
| **REST** | Client-side / ภายนอก | `GET /api/cms/posts?where[slug]=hello` |
| **Types** | ฝั่งหน้าเว็บ | `easy-cms generate:types` → `easy-cms-types.ts` |

Local API อนุมาน type จาก config ได้เองแม้ยังไม่ได้ generate
GraphQL ยกไป v2+

## 9. Auth และ Access Control

- **Users ในตัว:** collection `users` แยกจาก user ของแอปลูกค้า, login ด้วย email + password
- **Session:** cookie แบบ httpOnly, Secure, SameSite=Lax, ลงนามด้วย `EASY_CMS_SECRET`
- **Password:** scrypt (`node:crypto`)
- **Access:** เขียนเป็นฟังก์ชันต่อ operation ต่อ collection (`read/create/update/delete`), มี helper `isAdmin`, `isLoggedIn`
- **Default:** ทุก operation **ปิด** สำหรับผู้ที่ไม่ได้ login จนกว่า developer จะเปิดเอง
- **เผื่อ v2:** `auth.strategy` สำหรับเสียบ auth ภายนอก

## 10. Media

- **Storage adapter interface:** `put / get / delete / url`
- **v0.1:** Local disk
- **v0.2:** S3-compatible (AWS S3, Cloudflare R2, MinIO) — จำเป็นสำหรับ Vercel/serverless
- **รูปภาพ:** `sharp` เป็น optional dependency สำหรับสร้าง thumbnail และ resize
- ตรวจ MIME type และขนาดไฟล์ตอนอัปโหลด

## 11. Content features

| ฟีเจอร์ | v0.1 | ภายหลัง |
|---|---|---|
| Collections | ✅ | |
| Globals (singleton) | ✅ | |
| Draft / Publish | ✅ | |
| Lifecycle hooks (`beforeChange`, `afterChange`, `beforeDelete`) | ✅ | |
| Plugins แบบ `(config) => config` | ✅ | |
| Admin UI ภาษา TH/EN | ✅ | |
| Version history | | v2 |
| Localization ของ content | | v2 |
| Blocks / page builder | | v2 |
| Webhooks | | v2 |

## 12. CLI และ DX

```bash
npx create-easy-cms          # ตรวจ Nuxt/Next อัตโนมัติ → ติดตั้ง adapter, สร้าง config, route
easy-cms create-admin        # สร้าง admin คนแรก
easy-cms generate:types
easy-cms migrate:create <name>
easy-cms migrate
easy-cms serve               # standalone (v0.2)
```

## 13. Runtime และ Security

- **Runtime:** Node ≥ 22.12 (Node 20 EOL แล้วตั้งแต่ 2026-04), Bun แบบ best-effort, **ไม่รองรับ Edge** ใน v0.1
- **Security baseline:**
  - ป้องกัน CSRF สำหรับ Admin/REST ที่ใช้ cookie auth
  - Rate limit ตอน login
  - Secret อ่านจาก env เท่านั้น (`EASY_CMS_SECRET`), ถ้าไม่มีต้อง fail ตั้งแต่ตอน start
  - ตรวจ MIME/ขนาดไฟล์อัปโหลด

## 14. Testing

| ชั้น | เครื่องมือ | ขอบเขต |
|---|---|---|
| Unit | Vitest | config, validation, access, hooks |
| Integration | Vitest + Testcontainers | Local API / REST บนทั้ง SQLite และ Postgres |
| E2E | Playwright | หน้า Admin บน `examples/nuxt-blog` **และ** `examples/next-blog` ทุก PR |

## 15. Roadmap

ทำคนเดียวเป็นงานเสริม (~10–15 ชม./สัปดาห์), ประเมินว่า v0.1 ใช้เวลา **5–6 เดือน**

| Milestone | เนื้อหา | ประมาณ |
|---|---|---|
| **M0** Foundation | monorepo, CI, `defineConfig`, types ของ config | 2 สัปดาห์ |
| **M1** Core + DB | สร้าง Drizzle schema จาก config, Local API (CRUD), migration, SQLite | 5 สัปดาห์ |
| **M2** Auth + Access + REST | users, session, scrypt, access functions, REST handler, CSRF | 4 สัปดาห์ |
| **M3** Nuxt adapter | Nuxt module + `examples/nuxt-blog` | 2 สัปดาห์ |
| **M4** Admin UI | login, list/edit ของ collection, globals, field components, Tiptap, i18n TH/EN | 7 สัปดาห์ |
| **M5** Upload + Drafts + Hooks | local storage, draft/publish, lifecycle hooks | 3 สัปดาห์ |
| **M6** Next adapter + Postgres | `@easy-cms/next`, `examples/next-blog`, Postgres driver | 2 สัปดาห์ |
| **M7** CLI + Docs + Release | `create-easy-cms`, `generate:types`, VitePress, publish v0.1 | 2 สัปดาห์ |

**นิยามของ v0.1 เสร็จ:** ตัวอย่าง blog รันได้ทั้งบน Nuxt และ Next ด้วย collections + globals + auth + upload + draft/publish และ E2E ผ่านทั้งสองตัว

**v0.2:** โหมด standalone (`easy-cms serve`), S3 adapter

## 16. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | วิธีรับมือ |
|---|---|---|
| ทำคนเดียวแต่ต้องดูแล 2 framework | งานล่าช้า, adapter หนึ่งตัวไม่เสถียร | ทำ Nuxt ให้เสร็จสมบูรณ์ก่อน, E2E ครอบทั้งสองตัว, adapter ต้องบางที่สุด |
| Admin UI ใช้เวลามากกว่าที่ประเมิน | v0.1 เลื่อน | ใช้ UI component library ที่มีอยู่แล้ว, ตัด field ที่ไม่จำเป็นออกก่อน |
| Next.js / Nuxt เปลี่ยน API บ่อย | Adapter พัง | Core ไม่ขึ้นกับ framework, ปักเวอร์ชันที่รองรับไว้ใน peerDependencies |
| ช่องโหว่ security กระทบแอปลูกค้า | ความเชื่อมั่นเสียหาย | ปิดทุก operation เป็น default, มี security baseline, มี `SECURITY.md` |
| Payload เพิ่มการรองรับ Vue | จุดต่างหายไป | เน้นประสบการณ์ที่เรียบง่ายและ DX ของ Nuxt ให้ดีที่สุด |

## 17. ADRs

- [ADR-0001](adr/0001-embedded-web-standard-core.md) — Embedded + Web-standard core + adapters
- [ADR-0002](adr/0002-prebuilt-vue-admin-spa.md) — Admin UI เป็น Vue SPA ที่ build มาพร้อม package
- [ADR-0003](adr/0003-drizzle-sqlite-postgres.md) — Drizzle + SQLite/Postgres
- [ADR-0004](adr/0004-code-first-content-model.md) — Content model แบบ code-first
- [ADR-0005](adr/0005-storage-layout.md) — รูปแบบการเก็บข้อมูลและ migration

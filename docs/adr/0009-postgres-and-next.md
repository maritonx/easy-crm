# ADR-0009: Postgres adapter, shared Drizzle layer และ Next.js adapter

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## การตัดสินใจ

**Shared Drizzle layer (`@easy-cms/drizzle`)**
- ย้าย schema model, where → SQL, CRUD ที่มีตารางลูก และ migrator ออกจาก db-sqlite มาไว้ใน package เดียว adapter แต่ละตัวส่งแค่ `Dialect` (column type, LIKE/ILIKE, placeholder, DDL ของตาราง migrations, ฟังก์ชันของ drizzle-kit) กับ `Connection` (Drizzle db, `SqlRunner` สำหรับ SQL ดิบกับ transaction และ `close`)
- Hash ของ schema ไม่รวมชื่อ dialect เพื่อให้ migration files เดิมยังใช้ได้ ส่วนไฟล์ `.json` ของ migration บันทึก `dialect` ไว้ และถ้าเป็นของ DB อื่นจะไม่ยอมรัน
- `like` ใช้ได้เฉพาะ field ข้อความ (ตรงตามพฤติกรรมของ Postgres ที่ LIKE กับตัวเลขไม่ได้) และ id ในเงื่อนไขจะถูกแปลงเป็นตัวเลขเสมอ

**`@easy-cms/db-postgres`**
- ใช้ postgres.js สำหรับ server (`url`) หรือ PGlite (`pglite`: path, `memory://` หรือ instance) สำหรับ dev/test โดยไม่ต้องติดตั้ง Postgres
- Column: `serial`, `double precision`, `boolean`, `jsonb` ส่วนวันที่ยังเก็บเป็นข้อความ ISO เหมือน SQLite เพื่อให้เปรียบเทียบได้แบบเดียวกัน
- ลำดับการเรียงข้อความขึ้นกับ collation ของ DB (server ส่วนใหญ่เรียงแบบไม่สนตัวพิมพ์ ส่วน SQLite/PGlite เรียงแบบ binary)

**Integration tests ชุดเดียวทุก DB**
- `packages/integration` รัน test เดียวกันผ่าน vitest projects ได้แก่ `sqlite`, `pglite` และ `postgres` (เมื่อมี `POSTGRES_URL`, ใน CI ใช้ service `postgres:17`) โดยแยกข้อมูลแต่ละ test ด้วย table prefix บน DB ร่วมกัน

**`@easy-cms/next`**
- `createRouteHandlers(config)` / `createAdminRouteHandlers(config)` สำหรับ `app/api/cms/[[...path]]` และ `app/admin/[[...path]]`, `getEasyCMS(config)` (singleton ข้าม HMR) และ `getEasyCMSUser(config)` (ผ่าน `next/headers`)
- `withEasyCMS(nextConfig)` เพิ่ม `serverExternalPackages` และ `outputFileTracingIncludes` (admin `dist/app`, `easy-cms/migrations`, native binary จาก `db.bundle.traceInclude`)
- Next อาจ bundle package ของเรา (เช่น symlink ใน workspace) จึงไม่พึ่ง `import.meta.url` หรือ `new URL(..., import.meta.url)` ไว้หาไฟล์ แต่หา admin app ตอน runtime ตามสาย dependency: โปรเจกต์ → `@easy-cms/next` → `@easy-cms/admin`
- Next ตัด `/` ท้าย URL จึงปิด redirect `/admin` → `/admin/` ใน admin handler (`trailingSlashRedirect: false`) SPA ทำงานได้ทั้งสองแบบเพราะใช้ `<base href>`
- หน้าที่อ่านจาก CMS ควรเป็น dynamic เพราะ `next build` จะ prerender แล้ว query DB ในโหมด verify

## ผลที่ตามมา
- ✅ E2E ชุดเดียวกันผ่านทั้ง Nuxt + SQLite และ Next + Postgres (FR-ADP-03)
- ✅ ความเร็ว (NFR-PERF-01/02, ข้อมูล 10,000 รายการ, limit 10, depth 1): Postgres 17 จริงได้ Local API p95 2.7 ms และ REST p95 4.3 ms
- ❌ ใน monorepo ที่ใช้ symlink, Next จะแจ้งเตือนว่า trace ทั้งโปรเจกต์ เพราะ package ถูก bundle แทนที่จะเป็น external ส่วนการติดตั้งจาก npm ไม่มีปัญหานี้

# Software Requirements Specification — Easy CMS v0.1

- **เวอร์ชันเอกสาร:** 1.0
- **วันที่:** 2026-09-25
- **ผู้เขียน:** Kanawoot K.
- **สถานะ:** Draft for review
- **เอกสารที่เกี่ยวข้อง:** [DESIGN.md](DESIGN.md), [ADRs](adr/)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์
เอกสารนี้กำหนดความต้องการของซอฟต์แวร์ Easy CMS เวอร์ชัน 0.1 ทั้งด้านฟังก์ชันและด้านที่ไม่ใช่ฟังก์ชัน ใช้เป็นเกณฑ์สำหรับการพัฒนา การทดสอบ และการตรวจรับ
ส่วน *วิธี* สร้างระบบอยู่ใน [DESIGN.md](DESIGN.md)

### 1.2 ขอบเขต
Easy CMS เป็น Headless CMS แบบ open source (MIT) ที่ติดตั้งผ่าน npm และฝังเข้าไปในแอป Nuxt หรือ Next.js ของผู้ใช้ ระบบประกอบด้วย:
- Core library สำหรับนิยาม content แบบ code-first และจัดการข้อมูล
- Local API, REST API และการสร้าง TypeScript types
- หน้า Admin สำหรับ editor
- CLI สำหรับติดตั้ง, migration และ generate types

**นอกขอบเขต v0.1:** UI สร้าง content type, GraphQL, Edge runtime, localization ของ content, version history, blocks, webhooks, โหมด standalone, S3 storage, บริการ hosting

### 1.3 คำศัพท์

| คำ | ความหมาย |
|---|---|
| **Host app** | แอป Nuxt หรือ Next.js ของผู้ใช้ที่ติดตั้ง Easy CMS ไว้ |
| **Collection** | ประเภท content ที่มีได้หลายรายการ เช่น `posts` |
| **Global** | Content แบบมีรายการเดียว เช่น `site` settings |
| **Document** | ข้อมูล 1 รายการใน collection หรือ global |
| **Field** | คุณสมบัติหนึ่งของ document เช่น `title` |
| **Local API** | ฟังก์ชันที่เรียกได้ตรงใน server ของ host app โดยไม่ผ่าน HTTP |
| **Adapter** | Package ที่เชื่อม Easy CMS กับ framework ของ host app |
| **Access function** | ฟังก์ชันใน config ที่ตัดสินว่าผู้ใช้ทำ operation หนึ่งได้หรือไม่ |
| **Draft / Published** | สถานะของ document ก่อนและหลังการเผยแพร่ |

### 1.4 ระดับความสำคัญ
- **MUST**: ต้องมีใน v0.1
- **SHOULD**: ควรมีใน v0.1 แต่เลื่อนได้ถ้ามีเหตุผล
- **MAY**: มีก็ดี ไม่บังคับ

---

## 2. ภาพรวมของระบบ

### 2.1 บริบทของผลิตภัณฑ์
Easy CMS ทำงานภายใน process ของ host app ใช้ database เดียวกันหรือแยกกันก็ได้ และเสิร์ฟหน้า Admin กับ REST API ผ่าน route ของ host app

```
Editor ──► /admin ─┐
Browser ─► /api/cms ┼─► Adapter ─► Easy CMS Core ─► Database / Local storage
Host app ─► Local API ┘
```

### 2.2 กลุ่มผู้ใช้

| กลุ่ม | คำอธิบาย | ทักษะ |
|---|---|---|
| **Developer** | ติดตั้ง, เขียน config, กำหนดสิทธิ์, deploy | TypeScript, Nuxt หรือ Next.js |
| **Admin** | Editor ที่มีสิทธิ์สูงสุด จัดการ user ได้ | ไม่จำเป็นต้องมีทักษะเทคนิค |
| **Editor** | สร้าง แก้ไข และเผยแพร่ content | ไม่จำเป็นต้องมีทักษะเทคนิค |
| **Public visitor** | ผู้เข้าชมเว็บที่อ่าน content ผ่าน host app | — |

### 2.3 สภาพแวดล้อมการทำงาน
- Node.js ≥ 22.12 (22 Maintenance LTS, 24 Active LTS)
- Nuxt ≥ 3 หรือ Next.js ≥ 14 (App Router) — เวอร์ชันที่แน่นอนระบุใน `peerDependencies`
- SQLite หรือ PostgreSQL ≥ 14
- Browser สำหรับหน้า Admin: Chrome, Edge, Firefox, Safari (2 เวอร์ชันล่าสุด)

### 2.4 ข้อจำกัด
- **C-1** ผู้พัฒนามีคนเดียวและทำเป็นงานเสริม (~10–15 ชม./สัปดาห์)
- **C-2** License MIT, dependency ทุกตัวต้องมี license ที่เข้ากันได้กับ MIT
- **C-3** ไม่รองรับ Edge runtime
- **C-4** Host app ต้องมี server-side runtime (ใช้กับ SPA ล้วนไม่ได้ใน v0.1)

### 2.5 สมมติฐาน
- **A-1** Developer มีสิทธิ์รันคำสั่ง migration บน environment ที่ deploy
- **A-2** Host app deploy บน server ที่มี filesystem ถาวร (เพราะ v0.1 เก็บไฟล์ที่ local disk เท่านั้น)

---

## 3. Functional Requirements

### 3.1 การติดตั้งและ CLI (INS)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-INS-01 | `npx create-easy-cms` ต้องตรวจได้ว่าโปรเจกต์ปัจจุบันเป็น Nuxt หรือ Next.js และแจ้ง error ถ้าไม่ใช่ทั้งสองแบบ | MUST |
| FR-INS-02 | `create-easy-cms` ต้องติดตั้ง package ที่จำเป็น, สร้าง `easy-cms.config.ts` ตัวอย่าง และลงทะเบียน route `/admin` กับ `/api/cms` | MUST |
| FR-INS-03 | `create-easy-cms` ต้องถามชนิด database (SQLite/Postgres) และเพิ่ม `EASY_CMS_SECRET` ที่สุ่มขึ้นมาลงใน `.env` ถ้ายังไม่มี | MUST |
| FR-INS-04 | `easy-cms create-admin` ต้องสร้าง user ที่มี role `admin` จาก email และ password ที่รับเข้ามา | MUST |
| FR-INS-05 | `easy-cms generate:types` ต้องสร้างไฟล์ `easy-cms-types.ts` ที่มี type ของทุก collection และ global | MUST |
| FR-INS-06 | `easy-cms migrate:create <name>` ต้องสร้าง migration file จากส่วนต่างระหว่าง config กับ schema ปัจจุบัน | MUST |
| FR-INS-07 | `easy-cms migrate` ต้องรัน migration ที่ยังไม่ได้รันตามลำดับ และบันทึกผลไว้ใน DB | MUST |
| FR-INS-08 | ทุกคำสั่งต้องมี `--help` และคืน exit code ≠ 0 เมื่อเกิด error | MUST |

### 3.2 Configuration (CFG)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-CFG-01 | ระบบต้องอ่าน config จาก `easy-cms.config.ts` ที่ export `defineConfig({...})` | MUST |
| FR-CFG-02 | Config ต้องกำหนดได้: `secret`, `db`, `admin`, `collections`, `globals`, `plugins`, `upload` | MUST |
| FR-CFG-03 | ระบบต้องตรวจ config ตอน start และแจ้ง error ที่ระบุตำแหน่งชัดเจน เช่น slug ซ้ำ, field name ซ้ำ, relationship ชี้ไป collection ที่ไม่มี | MUST |
| FR-CFG-04 | ระบบต้องไม่ start ถ้าไม่มี `secret` หรือ secret สั้นกว่า 32 ตัวอักษร | MUST |
| FR-CFG-05 | Plugin คือฟังก์ชัน `(config) => config` และต้องรันตามลำดับก่อนการตรวจ config | MUST |
| FR-CFG-06 | Collection `users` ต้องถูกเพิ่มให้อัตโนมัติ และ developer เพิ่ม field ของตัวเองเข้าไปได้ | MUST |
| FR-CFG-07 | `routes.api` กำหนด path ของ REST API (default `/api/cms`) และ `serverURL` ทำให้ URL ของไฟล์เป็นแบบเต็ม | MUST |

### 3.3 Content Modeling (MOD)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-MOD-01 | ต้องรองรับ field types: `text, textarea, number, boolean, date, select, slug, email, json, richText, upload, relationship, array, group` | MUST |
| FR-MOD-02 | ทุก field ต้องรองรับ option `name`, `label`, `required`, `defaultValue` | MUST |
| FR-MOD-03 | `text`/`textarea` รองรับ `minLength`, `maxLength` ส่วน `number` รองรับ `min`, `max` | MUST |
| FR-MOD-04 | `select` ต้องรองรับ `options` และ `hasMany` | MUST |
| FR-MOD-05 | `slug` ต้องสร้างค่าจาก field ที่ระบุใน `from` ได้อัตโนมัติ และต้องไม่ซ้ำกันภายใน collection | MUST |
| FR-MOD-06 | `relationship` ต้องรองรับ `to` (collection เดียว) และ `hasMany` | MUST |
| FR-MOD-07 | `array` และ `group` ต้องซ้อน field อื่นได้ | MUST |
| FR-MOD-08 | Field ต้องรองรับ `unique` และ `index` | SHOULD |
| FR-MOD-09 | Field ต้องรองรับ `validate: (value, ctx) => true \| string` สำหรับ validation เพิ่มเติม | SHOULD |
| FR-MOD-10 | Collection ต้องกำหนด `useAsTitle` ได้ เพื่อใช้เป็นชื่อที่แสดงในหน้า Admin | SHOULD |

### 3.4 Data Management (DAT)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-DAT-01 | ระบบต้องสร้าง schema ของ DB จาก config และทุกตารางต้องมี prefix ที่กำหนดได้ (default `ecms_`) | MUST |
| FR-DAT-02 | ในโหมด development ระบบต้อง sync schema ให้อัตโนมัติเมื่อ config เปลี่ยน | MUST |
| FR-DAT-03 | ในโหมด production ระบบต้องไม่แก้ schema อัตโนมัติ ถ้าพบว่า schema ไม่ตรงกับ config ต้องแจ้ง error ที่ระบุ migration ที่ต้องรัน | MUST |
| FR-DAT-04 | Migration ต้องแตะเฉพาะตารางที่มี prefix ของ Easy CMS | MUST |
| FR-DAT-05 | ทุก document ต้องมี `id`, `createdAt`, `updatedAt` อัตโนมัติ | MUST |
| FR-DAT-06 | ต้องรองรับ SQLite และ PostgreSQL | MUST |

### 3.5 Local API (LAPI)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-LAPI-01 | ต้องมี `find`, `findById`, `create`, `update`, `delete`, `count` สำหรับ collection และ `findGlobal`, `updateGlobal` สำหรับ global | MUST |
| FR-LAPI-02 | `find` ต้องรองรับ `where` (`equals, not_equals, in, not_in, gt, gte, lt, lte, like, exists`, `and`, `or`), `sort`, `limit`, `page` | MUST |
| FR-LAPI-03 | `find` ต้องคืนผลพร้อมข้อมูล pagination: `docs, totalDocs, page, totalPages, hasNextPage` | MUST |
| FR-LAPI-04 | ต้องรองรับ `depth` สำหรับดึงข้อมูลของ relationship และ upload มาด้วย (default 1, สูงสุด 3) | MUST |
| FR-LAPI-05 | Type ของค่าที่คืนต้องอนุมานจาก config ได้โดยไม่ต้อง generate types | MUST |
| FR-LAPI-06 | Local API ต้องข้ามการตรวจ access เป็น default และต้องมี option `overrideAccess: false, user` สำหรับบังคับตรวจ | MUST |
| FR-LAPI-07 | Adapter ต้องให้ host app เข้าถึง instance ของ CMS ได้ Nuxt ผ่าน `useEasyCMS()` ฝั่ง server และ Next ผ่าน `getEasyCMS()` | MUST |

### 3.6 REST API (REST)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-REST-01 | ต้องมี endpoints ต่อไปนี้ภายใต้ `/api/cms`: `GET/POST /:collection`, `GET/PATCH/DELETE /:collection/:id`, `GET/POST /globals/:slug` | MUST |
| FR-REST-02 | Query string ต้องรองรับ `where`, `sort`, `limit`, `page`, `depth` ให้มีความหมายเดียวกับ Local API | MUST |
| FR-REST-03 | REST ต้องตรวจ access ทุก request เสมอ | MUST |
| FR-REST-04 | Error ต้องคืน JSON รูปแบบ `{ errors: [{ message, field? }] }` พร้อม status code ที่เหมาะสม (400, 401, 403, 404, 409, 413, 429, 500) | MUST |
| FR-REST-05 | ต้องมี auth endpoints: `POST /users/login`, `POST /users/logout`, `GET /users/me`, `GET /users/init` (มี user แล้วหรือยัง), `POST /users/first-register` (สร้าง admin คนแรก) | MUST |
| FR-REST-07 | ต้องรับ `Authorization: Bearer <token>` สำหรับ client ที่ไม่ใช่ browser (ไม่ต้องใช้ CSRF token) | SHOULD |
| FR-REST-08 | `POST /media` (multipart, field `file`) สำหรับอัปโหลด และ `GET /media/file/:key` สำหรับเสิร์ฟไฟล์แบบ public พร้อม CSP `sandbox` | MUST |
| FR-REST-06 | Error 500 ต้องไม่ส่ง stack trace กลับไปใน production | MUST |

### 3.7 Authentication (AUTH)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-AUTH-01 | User ต้อง login ด้วย email และ password ได้ | MUST |
| FR-AUTH-02 | Password ต้อง hash ด้วย scrypt พร้อม salt แยกต่อ user และต้องไม่เก็บ plain text หรือคืนค่า hash ออกทาง API | MUST |
| FR-AUTH-03 | เมื่อ login สำเร็จ ระบบต้องออก session cookie แบบ httpOnly, Secure (ใน production), SameSite=Lax ที่ลงนามด้วย `secret` | MUST |
| FR-AUTH-04 | Session ต้องหมดอายุตามค่าที่กำหนด (default 7 วัน) และ logout ต้องทำให้ session ใช้ไม่ได้ทันที | MUST |
| FR-AUTH-05 | ต้องจำกัดจำนวนครั้งที่ login ผิด (default 5 ครั้งต่อ 15 นาทีต่อ email + IP) และคืน 429 เมื่อเกิน IP มาจาก adapter (`getClientIp`) ถ้าไม่มีจะนับตาม email อย่างเดียว | MUST |
| FR-AUTH-10 | Role กำหนดได้ผ่าน `auth.roles` (ต้องมี `admin`) และระบบต้องไม่ยอมให้ลด role, ปิดใช้งาน หรือลบ admin คนสุดท้ายที่ยังใช้งานอยู่ | MUST |
| FR-AUTH-06 | Password ต้องยาวอย่างน้อย 8 ตัวอักษร | MUST |
| FR-AUTH-07 | Admin ต้องสร้าง, แก้ไข, ปิดการใช้งานและรีเซ็ต password ของ user อื่นได้ผ่านหน้า Admin | MUST |
| FR-AUTH-08 | User ต้องเปลี่ยน password ของตัวเองได้ | MUST |
| FR-AUTH-09 | ลืมรหัสผ่านผ่าน email | MAY |

### 3.8 Access Control (ACL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ACL-01 | Collection ต้องกำหนด access function แยกต่อ operation ได้: `read, create, update, delete` และ global กำหนด `read, update` | MUST |
| FR-ACL-02 | Access function รับ `{ user, id?, doc?, data? }` และคืน `boolean` หรือ `where` query เพื่อกรองรายการที่เห็นได้ | MUST |
| FR-ACL-03 | ถ้าไม่ได้กำหนด access ไว้ default ต้องเป็น "เฉพาะ user ที่ login แล้ว" ส่วนผู้ที่ไม่ได้ login ต้องถูกปฏิเสธ | MUST |
| FR-ACL-04 | ต้องมี helper `isAdmin`, `isLoggedIn`, `anyone` | MUST |
| FR-ACL-05 | Field ต้องกำหนด `access: { read, update }` ระดับ field ได้ | SHOULD |
| FR-ACL-06 | หน้า Admin ต้องซ่อนเมนูและปุ่มของ operation ที่ user ไม่มีสิทธิ์ | MUST |

### 3.9 Drafts และ Publishing (DRF)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-DRF-01 | Collection และ global ที่ตั้ง `drafts: true` ต้องมี field `status` เป็น `draft` หรือ `published` | MUST |
| FR-DRF-02 | บันทึกแบบ draft ต้องข้ามการตรวจ `required` แต่ยังตรวจ type ของข้อมูล | MUST |
| FR-DRF-03 | Publish ต้องตรวจ validation ครบทุกข้อ | MUST |
| FR-DRF-04 | Local API และ REST ต้องรองรับ `draft: true` เพื่อดึงข้อมูลที่รวม draft และ default ต้องคืนเฉพาะ `published` เมื่อไม่ได้ login | MUST |
| FR-DRF-05 | ต้อง unpublish (เปลี่ยนกลับเป็น draft) ได้ | MUST |
| FR-DRF-06 | ใน v0.1 เอกสารมีฉบับเดียว: ถ้าบันทึกเอกสารที่ published เป็น draft จะเท่ากับ unpublish (version history อยู่ใน v2) | MUST |

### 3.10 Media / Upload (UPL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-UPL-01 | ต้องมี collection `media` ในตัว เก็บ `filename, mimeType, filesize, width, height, alt, url` | MUST |
| FR-UPL-02 | ไฟล์ต้องเก็บไว้ที่ local disk ใน directory ที่กำหนดได้ | MUST |
| FR-UPL-03 | ต้องตรวจ MIME type จากเนื้อหาไฟล์ (ไม่ใช่นามสกุล) เทียบกับ allowlist ที่กำหนดได้ | MUST |
| FR-UPL-04 | ต้องจำกัดขนาดไฟล์ (default 10 MB) และคืน 413 เมื่อเกิน | MUST |
| FR-UPL-05 | ชื่อไฟล์ที่บันทึกต้องผ่านการ sanitize และไม่ซ้ำกัน เพื่อป้องกัน path traversal และการเขียนทับ | MUST |
| FR-UPL-06 | ถ้าติดตั้ง `sharp` ไว้ ระบบต้องสร้าง thumbnail ตาม `imageSizes` ที่กำหนด | SHOULD |
| FR-UPL-07 | Storage ต้องเป็น interface (`put/get/delete/url`) เพื่อเพิ่ม adapter อื่นใน v0.2 ได้ | MUST |

### 3.11 Rich Text (RTX)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-RTX-01 | Field `richText` ต้องเก็บข้อมูลเป็น Tiptap JSON | MUST |
| FR-RTX-02 | Editor ต้องรองรับ heading (H2–H4), paragraph, bold, italic, underline, link, bullet/ordered list, blockquote, code, image (จาก media) | MUST |
| FR-RTX-03 | `@easy-cms/richtext` ต้องมี `renderRichText(json)` ที่คืน HTML ที่ escape แล้วและปลอดภัยจาก XSS | MUST |

### 3.12 Hooks (HOOK)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-HOOK-01 | Collection ต้องรองรับ hooks: `beforeValidate`, `beforeChange`, `afterChange`, `beforeDelete`, `afterDelete`, `afterRead` | MUST |
| FR-HOOK-02 | Hooks ต้องเป็น async ได้ และรันตามลำดับใน array | MUST |
| FR-HOOK-03 | `beforeChange` ต้องแก้ข้อมูลที่จะบันทึกได้ และถ้า throw ต้องยกเลิก operation | MUST |
| FR-HOOK-04 | Hooks ต้องทำงานเหมือนกันไม่ว่าจะเรียกผ่าน Local API, REST หรือหน้า Admin | MUST |
| FR-HOOK-05 | Global ต้องรองรับ `beforeChange`, `afterChange`, `afterRead` | MUST |

### 3.13 หน้า Admin (ADM)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ADM-01 | หน้า Admin ต้องเข้าถึงได้ที่ path ที่กำหนด (default `/admin`) และ redirect ไปหน้า login ถ้ายังไม่ได้ login | MUST |
| FR-ADM-02 | ถ้ายังไม่มี user ในระบบ หน้า Admin ต้องแสดงฟอร์มสร้าง admin คนแรก | MUST |
| FR-ADM-03 | Sidebar ต้องแสดงรายการ collections และ globals ตาม access ของ user | MUST |
| FR-ADM-04 | หน้า list ต้องแสดงตาราง, ค้นหาจาก `useAsTitle`, เรียงลำดับ, แบ่งหน้า และลบได้ทั้งแบบรายการเดียวและหลายรายการ | MUST |
| FR-ADM-05 | หน้า edit ต้องสร้างฟอร์มจาก config ได้อัตโนมัติ และมี input ที่เหมาะกับทุก field type ใน FR-MOD-01 | MUST |
| FR-ADM-06 | ต้องแสดง validation error ที่ field ที่ผิด | MUST |
| FR-ADM-07 | ถ้าเปิด drafts ต้องมีปุ่ม "Save draft" และ "Publish" แยกกัน และแสดงสถานะปัจจุบัน | MUST |
| FR-ADM-08 | ต้องเตือนก่อนออกจากหน้าเมื่อมีข้อมูลที่ยังไม่ได้บันทึก | SHOULD |
| FR-ADM-09 | ต้องมีหน้า Media library สำหรับอัปโหลด ดู และเลือกไฟล์ | MUST |
| FR-ADM-10 | Field `relationship` ต้องมีตัวเลือกที่ค้นหาได้ | MUST |
| FR-ADM-11 | ต้องสลับภาษา UI ระหว่าง TH/EN ได้ และตั้ง default ผ่าน `admin.locale` | MUST |
| FR-ADM-12 | Label ใน config ต้องกำหนดแยกต่อภาษาได้ เช่น `label: { th: 'ชื่อเรื่อง', en: 'Title' }` | SHOULD |
| FR-ADM-13 | ต้องมีหน้า Account สำหรับเปลี่ยน password ของตัวเอง | MUST |

### 3.14 Adapters (ADP)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| FR-ADP-01 | `@easy-cms/nuxt` ต้องเป็น Nuxt module ที่ลงทะเบียน server routes สำหรับ REST และเสิร์ฟหน้า Admin | MUST |
| FR-ADP-02 | `@easy-cms/next` ต้องมี route handler สำหรับ App Router ที่ประกาศ `runtime = 'nodejs'` | MUST |
| FR-ADP-03 | ทั้งสอง adapter ต้องผ่านชุด E2E test เดียวกันทั้งหมด | MUST |
| FR-ADP-04 | Adapter ต้องไม่มี business logic และเรียกใช้ core handler เท่านั้น | MUST |

---

## 4. Non-Functional Requirements

### 4.1 Performance (PERF)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-PERF-01 | Local API `find` (limit 10, depth 1) บน Postgres ที่มีข้อมูล 10,000 รายการ ต้องตอบภายใน p95 < 50 ms (ไม่รวมเวลาเครือข่าย) | SHOULD |
| NFR-PERF-02 | REST `GET /:collection` ต้องตอบภายใน p95 < 150 ms ภายใต้เงื่อนไขเดียวกัน | SHOULD |
| NFR-PERF-03 | Bundle ของหน้า Admin (gzip) โหลดครั้งแรกต้อง < 500 KB โดย Rich text editor ต้อง lazy-load | SHOULD |
| NFR-PERF-04 | การเพิ่ม Easy CMS ต้องทำให้เวลา cold start ของ host app เพิ่มขึ้นไม่เกิน 300 ms | SHOULD |

### 4.2 Security (SEC)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-SEC-01 | Request ที่เปลี่ยนแปลงข้อมูลด้วย cookie auth ต้องผ่านการป้องกัน CSRF (ตรวจ `Origin` + CSRF token) | MUST |
| NFR-SEC-02 | Query ทุกตัวต้องใช้ parameterized query ผ่าน Drizzle ห้ามต่อ string เป็น SQL | MUST |
| NFR-SEC-03 | Input จาก REST ต้องผ่าน validation ตาม config ก่อนถึง DB | MUST |
| NFR-SEC-04 | หน้า Admin ต้องส่ง header `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy` | MUST |
| NFR-SEC-05 | Secret, password hash และ session token ต้องไม่ปรากฏใน log หรือ error response | MUST |
| NFR-SEC-06 | ต้องมี `SECURITY.md` ที่ระบุช่องทางรายงานช่องโหว่ | MUST |
| NFR-SEC-07 | CI ต้องสแกนหา dependency ที่มีช่องโหว่ (`pnpm audit` หรือเทียบเท่า) | SHOULD |

### 4.3 Usability (USE)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-USE-01 | Developer ที่รู้จัก Nuxt หรือ Next ต้องติดตั้งจนถึง login หน้า Admin ได้ภายใน 2 นาทีด้วย SQLite | MUST |
| NFR-USE-02 | Error message ของ config และ CLI ต้องบอกสาเหตุและวิธีแก้ | MUST |
| NFR-USE-03 | หน้า Admin ต้องใช้งานได้บนหน้าจอกว้างตั้งแต่ 768 px ขึ้นไป | MUST |
| NFR-USE-04 | หน้า Admin ต้องผ่านเกณฑ์ WCAG 2.1 AA สำหรับ contrast, การใช้งานด้วย keyboard และ label ของฟอร์ม | SHOULD |

### 4.4 Reliability (REL)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-REL-01 | Operation ที่เขียนข้อมูลหลายตาราง (เช่น array, hasMany) ต้องทำใน transaction เดียว | MUST |
| NFR-REL-02 | Migration ที่ล้มเหลวต้อง rollback และไม่ถูกบันทึกว่ารันแล้ว | MUST |
| NFR-REL-03 | ถ้า `afterChange` hook throw ข้อมูลต้องยังถูกบันทึก และ error ต้องถูก log | MUST |

### 4.5 Maintainability (MNT)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-MNT-01 | เขียนด้วย TypeScript แบบ `strict` ทั้งหมด | MUST |
| NFR-MNT-02 | `@easy-cms/core` ต้องมี test coverage ≥ 80% (lines) | SHOULD |
| NFR-MNT-03 | ทุก package ต้องใช้ semver และมี changelog ที่สร้างจาก Changesets | MUST |
| NFR-MNT-04 | `@easy-cms/core` ต้องไม่ import จาก Nuxt, Next หรือ Vue | MUST |

### 4.6 Compatibility และ Portability (CMP)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-CMP-01 | ต้องทำงานบน Node.js 22 และ 24 ทั้งบน Linux, macOS และ Windows | MUST |
| NFR-CMP-02 | ต้อง publish เป็น ESM พร้อม type declarations | MUST |
| NFR-CMP-03 | ควรทำงานบน Bun ได้ (best-effort ไม่บังคับใน CI) | MAY |

### 4.7 Documentation (DOC)

| ID | ความต้องการ | ระดับ |
|---|---|---|
| NFR-DOC-01 | ต้องมีเว็บ docs (VitePress, ภาษาอังกฤษ) ครอบคลุม: Getting started (Nuxt/Next), Config reference, Field types, Access control, Hooks, Local API, REST API, CLI, Deployment | MUST |
| NFR-DOC-02 | ต้องมี `examples/nuxt-blog` และ `examples/next-blog` ที่รันได้ | MUST |
| NFR-DOC-03 | Public API ทุกตัวต้องมี TSDoc | SHOULD |

---

## 5. External Interfaces

### 5.1 User Interface
- หน้า Admin เป็น Vue 3 SPA เสิร์ฟที่ `admin.path`
- หน้าหลัก: Login, สร้าง admin คนแรก, Dashboard, List, Edit, Global edit, Media library, Account

### 5.2 Software Interfaces

| Interface | รายละเอียด |
|---|---|
| Nuxt | Nuxt module (`modules: ['@easy-cms/nuxt']`) |
| Next.js | Route handler ใน App Router + helper `getEasyCMS()` |
| SQLite | ผ่าน Drizzle + `better-sqlite3` หรือ `libsql` |
| PostgreSQL | ผ่าน Drizzle + `postgres` / `pg` |
| sharp | Optional peer dependency |

### 5.3 Communication Interfaces
- REST ผ่าน HTTP(S), JSON (UTF-8), upload ผ่าน `multipart/form-data`
- Auth ด้วย session cookie

---

## 6. Data Requirements

### 6.1 ตารางในตัว

| ตาราง | คำอธิบาย |
|---|---|
| `ecms_users` | ผู้ใช้หลังบ้าน: email (unique), password hash, role, active, createdAt, updatedAt |
| `ecms_sessions` | session ที่ยังใช้ได้ สำหรับ logout/revoke |
| `ecms_media` | metadata ของไฟล์ |
| `ecms_migrations` | ประวัติ migration ที่รันแล้ว |
| `ecms_globals` | ข้อมูลของ globals |
| `ecms_<collection>` | 1 ตารางต่อ collection + ตารางย่อยสำหรับ array/hasMany |

### 6.2 การเก็บรักษาข้อมูล
- ลบ document แล้วต้องลบออกจาก DB จริง (ยังไม่มี soft delete ใน v0.1)
- ลบ media แล้วต้องลบไฟล์และ thumbnail ออกจาก storage ด้วย
- Session ที่หมดอายุต้องถูกล้างออกเป็นระยะ

---

## 7. เกณฑ์ตรวจรับ v0.1

v0.1 ผ่านการตรวจรับเมื่อครบทุกข้อต่อไปนี้:

1. ทุก requirement ระดับ **MUST** ผ่าน test ที่เกี่ยวข้อง
2. `examples/nuxt-blog` และ `examples/next-blog` ทำสถานการณ์นี้ได้ทั้งคู่ และผ่าน Playwright E2E ใน CI:
   1. รัน `npx create-easy-cms` ในโปรเจกต์ใหม่
   2. สร้าง admin คนแรก → login
   3. สร้าง post พร้อมรูป cover และ rich text → บันทึกเป็น draft
   4. หน้าเว็บสาธารณะต้องไม่เห็น draft
   5. Publish → หน้าเว็บสาธารณะเห็น post ผ่าน Local API และ REST
   6. แก้ไข global `site` → หน้าเว็บแสดงค่าใหม่
   7. Editor (ไม่ใช่ admin) ต้องจัดการ users ไม่ได้
3. Integration test ผ่านบนทั้ง SQLite และ PostgreSQL
4. NFR-USE-01 (ติดตั้งจนถึง login ภายใน 2 นาที) ผ่านการทดสอบด้วยมือบน macOS และ Linux
5. เว็บ docs ครบตาม NFR-DOC-01 และ publish ทุก package ขึ้น npm ได้

---

## 8. Traceability กับ Milestones

| Milestone | Requirements |
|---|---|
| M0 Foundation | FR-CFG-01..05, NFR-MNT-01, NFR-MNT-03, NFR-CMP-02 |
| M1 Core + DB | FR-MOD-*, FR-DAT-*, FR-LAPI-*, FR-INS-06..07, NFR-REL-01..02 |
| M2 Auth + Access + REST | FR-AUTH-*, FR-ACL-01..05, FR-REST-*, FR-CFG-06, NFR-SEC-01..05 |
| M3 Nuxt adapter | FR-ADP-01, FR-ADP-04 |
| M4 Admin UI | FR-ADM-*, FR-ACL-06, FR-RTX-*, NFR-PERF-03, NFR-USE-03..04 |
| M5 Upload + Drafts + Hooks | FR-UPL-*, FR-DRF-*, FR-HOOK-*, NFR-REL-03 |
| M6 Next adapter + Postgres | FR-ADP-02..03, FR-DAT-06 |
| M7 CLI + Docs + Release | FR-INS-01..05, FR-INS-08, NFR-DOC-*, NFR-USE-01..02, NFR-SEC-06 |

---

## 9. ประวัติการแก้ไข

| เวอร์ชัน | วันที่ | รายละเอียด |
|---|---|---|
| 1.0 | 2026-09-25 | ฉบับแรก จากการสรุปการออกแบบใน [DESIGN.md](DESIGN.md) |
| 1.1 | 2026-09-25 | เปลี่ยน Node ขั้นต่ำเป็น 22.12 เพราะ Node 20 EOL แล้ว |
| 1.2 | 2026-09-25 | M2: เพิ่ม FR-REST-05 (init, first-register), FR-REST-07 (Bearer), FR-AUTH-10 (roles, admin คนสุดท้าย) |
| 1.3 | 2026-09-25 | M5: FR-REST-08 (อัปโหลด/ไฟล์), FR-CFG-07 (`routes.api`, `serverURL`), ระบุว่า drafts ใน v0.1 ไม่มี version แยก |

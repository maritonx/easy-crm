# ADR-0006: โครงสร้างของ Nuxt adapter

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
`@easy-cms/nuxt` ต้องทำให้ server ของ Nuxt ใช้ config ของผู้ใช้ (ที่เป็น TypeScript) ได้ทั้งตอน dev และ production ต้องให้ `useEasyCMS()` ได้ type จาก config จริง และต้องให้ `.output` ที่ build แล้วรันได้โดยไม่ต้องพึ่ง `node_modules` ของโปรเจกต์

ระหว่างทำพบปัญหาสามข้อ:
1. ไฟล์ `.ts` ที่สร้างไว้ใน buildDir จะไม่ถูก transpile เมื่อ buildDir อยู่ใต้ `node_modules` (กรณีของ `@nuxt/test-utils`)
2. ไฟล์ `.mjs` ที่สร้างไว้ใน `.nuxt` ถูก Node โหลดตรงๆ ตอน dev จึง import config ที่ไม่มีนามสกุลไม่ได้
3. libsql โหลด native binary ด้วย `require()` ที่คำนวณชื่อตอน runtime ทำให้ output tracing ของ Nitro ไม่คัดลอก binary ไปด้วย

## การตัดสินใจ
- ใช้ **Nitro virtual modules** (`#easy-cms-local-api`, `#easy-cms-rest-handler`) ซึ่ง import config ด้วย absolute path ทำให้ Nitro bundle และ compile config ในทุกโหมด
- ประกาศ type ของ virtual module ด้วยไฟล์ `.d.ts` แบบ script (มี `declare module` และไม่มี top-level export) ที่อ้าง `typeof import(config).default` ทำให้ Local API ได้ type ของ collection
- Startup plugin เป็นไฟล์จริงใน `dist/runtime` และตั้ง `nitro.externals.inline` ให้ bundle โฟลเดอร์ runtime
- `DatabaseAdapter.bundle.traceInclude` คือรายชื่อไฟล์ที่ adapter โหลดแบบ dynamic ตอน build module จะอ่าน config ด้วย `importConfig()` (ไม่ validate) แล้วส่งต่อให้ `nitro.externals.traceInclude` ทำให้ Nuxt module ไม่ต้องรู้จัก libsql
- Path ของฐานข้อมูลที่เป็นแบบ relative และโฟลเดอร์ migrations อ้างอิงจาก working directory จึงต้อง start server จาก root ของโปรเจกต์
- CLI โหลด `<cwd>/.env` แบบเดียวกับ Nuxt/Next (ไม่ทับค่า env ที่มีอยู่)

## ผลที่ตามมา
- ✅ ใช้ได้ทั้ง `nuxi dev`, `nuxi build` และ `@nuxt/test-utils` มี e2e test ครอบทั้งสองโหมด
- ✅ `.output` รันได้เองพร้อม native binary ของ libsql
- ❌ ต้อง build บน OS/architecture เดียวกับที่ deploy เพราะ binary ที่ถูกคัดลอกไปเป็นของเครื่องที่ build
- ❌ พึ่ง working directory ถ้า start server จากโฟลเดอร์อื่นจะหา migrations ไม่เจอ (มีข้อความแนะนำวิธีแก้ใน error)

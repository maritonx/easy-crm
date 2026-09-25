# ADR-0005: รูปแบบการเก็บข้อมูลและ migration

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
ตอนทำ M1 ต้องตัดสินใจว่าจะเก็บ field แต่ละประเภทลงตารางอย่างไร และจะใช้ drizzle-kit สร้าง migration โดยไม่แตะตารางของแอปลูกค้าได้อย่างไร

## การตัดสินใจ

**ตาราง**
- 1 collection = 1 ตาราง `ecms_<slug>` มี `id` (integer autoincrement), `created_at`, `updated_at` และ `status` (เมื่อเปิด drafts)
- Field ทั่วไป = 1 คอลัมน์ ชื่อเป็น snake_case, field ใน group ถูกแผ่ออก (`seo.metaTitle` → `seo_meta_title`)
- `array` = ตารางลูก `ecms_<slug>__<field>` มี `id` (text, สร้างจาก UUID หรือส่งมาเอง), `_parent_id`, `_order` ซ้อนกันได้หลายชั้น
- `select`/`relationship` ที่เป็น `hasMany` = ตารางลูกที่มีคอลัมน์ `value`
- Globals เก็บเป็น JSON ในตาราง `ecms_globals` แถวละ global เพราะมีแถวเดียวและไม่ต้อง query ตาม field
- ถ้าชื่อตารางหรือคอลัมน์ชนกัน ให้แจ้งเป็น `ConfigError`

**ความถูกต้องของข้อมูล**
- ไม่ใช้ foreign key constraint: การลบตารางลูกทำในโค้ดภายใน transaction เดียวกัน และตรวจว่า relationship มีอยู่จริงตอนบันทึก
- ถ้าเอกสารที่อ้างถึงถูกลบไปทีหลัง ตอน populate จะได้ `null` (single) หรือถูกตัดออก (hasMany)

**Migration**
- ใช้ `generateSQLiteDrizzleJson` + `generateSQLiteMigration` ของ drizzle-kit แบบ diff ระหว่าง snapshot ที่มีเฉพาะตารางของ Easy CMS **ไม่ใช้** `pushSQLiteSchema` เพราะมันดูทั้ง DB และจะเสนอให้ลบตารางของแอปลูกค้า
- ตอน dev push และในโหมดที่ไม่ใช่ terminal ให้ diff สองรอบ (prev → union → cur) เพื่อไม่ให้ drizzle-kit ถามเรื่อง rename การเปลี่ยนชื่อจึงกลายเป็นลบคอลัมน์เก่าแล้วเพิ่มใหม่ ส่วน `migrate:create` ใน terminal ให้ drizzle-kit ถามเรื่อง rename ได้
- Migration files อยู่ที่ `easy-cms/migrations/<timestamp>_<name>.sql` + `.json` (snapshot + hash)
- ตอน production ตรวจด้วย hash ของ schema model ที่คำนวณเอง จึงไม่ต้องโหลด drizzle-kit (~280 ms) ตอน start
- แต่ละ migration รันใน batch เดียว (transaction) พร้อมกับบันทึกลง `ecms_migrations`
- DB ที่ผ่าน dev push มาแล้วจะรัน migration ทับไม่ได้

**Driver**
- ใช้ `@libsql/client` (รองรับไฟล์ SQLite และ Turso) ไม่รองรับ `:memory:` เพราะ transaction เปิด connection ใหม่

## ผลที่ตามมา
- ✅ Query และ index ตาม field ได้จริง รวมถึง field ใน array และ hasMany (ผ่าน EXISTS)
- ✅ ไม่มีทางแตะตารางของแอปลูกค้า (มี test ครอบ)
- ❌ Rename field ใน dev ทำให้ข้อมูลใน field นั้นหาย
- ❌ ไม่มี foreign key ถ้าแก้ DB ตรงๆ นอก Easy CMS อาจได้ข้อมูลที่ไม่สอดคล้องกัน
- ❌ ID เป็น integer ถ้าจะรองรับ UUID ต้องเพิ่มเป็น option ภายหลัง

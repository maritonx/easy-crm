# ADR-0003: Drizzle + SQLite/Postgres

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
ต้องสร้าง schema ของ DB จาก config แบบ code-first, รองรับหลาย DB และมี migration

## การตัดสินใจ
- ใช้ **Drizzle ORM** เป็นชั้นเชื่อม DB
- v0.1 รองรับ **SQLite** (dev) และ **Postgres** (prod) ส่วน MySQL พิจารณาภายหลัง
- ใช้ DB ร่วมกับแอปลูกค้าเป็น default และทุกตารางมี prefix `ecms_`
- Dev ใช้ auto-push, Prod ใช้ migration files ถ้าพบ drift บน prod ให้แจ้ง error

## ผลที่ตามมา
- ✅ Setup ง่าย (SQLite ไม่ต้องติดตั้งอะไรเพิ่ม), ได้ type-safe query
- ✅ ใช้ Drizzle Kit สร้าง migration ได้เลย
- ❌ ผูกกับ Drizzle ถ้า Drizzle เปลี่ยน API ต้องตามแก้
- ❌ Driver ของ SQLite ทำให้ใช้บน Edge runtime ไม่ได้

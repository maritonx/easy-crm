# ADR-0004: Content model แบบ code-first

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
Content type นิยามได้สองแบบ: เขียนเป็นโค้ด หรือสร้างผ่าน UI แบบลากวาง

## การตัดสินใจ
- นิยาม collections, globals, fields, access และ hooks ใน `easy-cms.config.ts` ห่อด้วย `defineConfig()`
- สร้าง TypeScript types ด้วย `easy-cms generate:types` และให้ Local API อนุมาน type จาก config ได้เอง
- ยังไม่ทำ UI builder

## ผลที่ตามมา
- ✅ เก็บใน git และ review ได้, ย้ายจาก dev ไป prod ด้วย migration
- ✅ ได้ type-safe ทั้งฝั่ง server และ frontend
- ❌ Editor สร้าง content type เองไม่ได้ ต้องให้ developer ทำ

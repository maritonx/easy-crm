# ADR-0001: Embedded + Web-standard core + adapters

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
ลูกค้าสร้างเว็บด้วย Vue หรือ React และต้องการระบบหลังบ้านที่ติดตั้งผ่าน npm ได้ มี 3 ทางเลือก: standalone server (แบบ Strapi), ฝังในแอปลูกค้า (แบบ Payload) หรือ SaaS + SDK (แบบ Contentful)

## การตัดสินใจ
- Easy CMS **ฝังในแอปลูกค้าที่มี server อยู่แล้ว**
- `@easy-cms/core` เปิด handler แบบ `(Request) => Promise<Response>` ตามมาตรฐาน Web และ Local API
- ทำ adapter บางๆ ต่อ framework: `@easy-cms/nuxt` (ทำก่อน), `@easy-cms/next`
- v0.2 เพิ่มโหมด standalone (`easy-cms serve`) สำหรับลูกค้าที่ใช้ SPA ล้วน

## ผลที่ตามมา
- ✅ เรียก Local API ได้โดยไม่ผ่าน HTTP, deploy เป็นแอปเดียว
- ✅ รองรับทั้ง Vue (Nuxt) และ React (Next) ซึ่งเป็นจุดต่างจาก Payload
- ❌ Vite SPA ล้วนใช้ไม่ได้จนกว่าจะมีโหมด standalone
- ❌ ต้องดูแล adapter หลายตัว จึงต้องให้ adapter บางที่สุดและมี E2E ครอบทุกตัว

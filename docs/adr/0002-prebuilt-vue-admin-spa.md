# ADR-0002: Admin UI เป็น Vue SPA ที่ build มาพร้อม package

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
Admin UI ต้องใช้ได้เหมือนกันทั้งเมื่อฝังใน Nuxt และ Next ถ้าเขียน Admin ด้วย framework ของ host จะต้องทำ Admin สองชุด

## การตัดสินใจ
- เขียน Admin ด้วย **Vue 3 + Vite** แล้ว build เป็น static SPA ไว้ใน `@easy-cms/admin`
- Adapter เสิร์ฟไฟล์ที่ `/admin` และ Admin คุยกับ backend ผ่าน REST
- มี i18n TH/EN ตั้งแต่ v0.1

## ผลที่ตามมา
- ✅ มี Admin ชุดเดียว ไม่ขึ้นกับ framework ของ host
- ✅ Build Admin ไว้ล่วงหน้า ลูกค้าไม่ต้อง build เอง
- ❌ Developer ที่ใช้ Next จะเขียน custom field เป็น React component แทรกเข้าไปไม่ได้ง่ายๆ ต้องออกแบบช่องทาง extension ภายหลัง

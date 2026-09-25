# ADR-0007: โครงสร้างของหน้า Admin

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท
หน้า Admin (ADR-0002) ต้องรู้โครงสร้าง content และสิทธิ์ของผู้ใช้โดยไม่ต้อง build ใหม่ทุกครั้งที่ config เปลี่ยน ต้องเสิร์ฟได้จาก path ใดก็ได้ และต้องมีขนาดเล็ก (NFR-PERF-03)

## การตัดสินใจ
- **Schema จาก server:** `GET /api/cms/admin/schema` ส่ง collection, global, field (แปลงให้ส่งเป็น JSON ได้ ไม่รวม hidden field) และสิทธิ์ของผู้ใช้คนปัจจุบัน ถ้า access คืน `where` จะถือว่า "ทำได้บางรายการ"
- **สิทธิ์ต่อเอกสาร:** `GET /api/cms/admin/access/:collection/:id` แปลงสิทธิ์แบบ `where` ให้เป็นคำตอบที่แน่นอนสำหรับเอกสารนั้น หน้าแก้ไขใช้ค่านี้ซ่อนปุ่ม Save/Delete (เช่น editor ดูโปรไฟล์ของ admin ได้แต่แก้ไม่ได้)
- **เสิร์ฟจาก path ใดก็ได้:** build ด้วย `base: './'` แล้วตอนเสิร์ฟใส่ `<base href>` และ `<meta name="easy-cms">` (adminPath, apiPath, locale) ลงใน `shell.html`
- **ชื่อไฟล์ `shell.html`:** ไม่ใช้ `index.html` เพื่อไม่ให้ static server (Nitro public assets, public dir ของ Next) เสิร์ฟไฟล์ดิบที่ยังไม่ได้ใส่ค่าที่ root ของ admin
- **Nuxt:** asset เสิร์ฟเป็น Nitro `publicAssets` (`fallthrough: true`, cache 1 ปี และบน host แบบ serverless จะอยู่บน CDN) ส่วน HTML เสิร์ฟจาก handler ที่ใส่ CSP, `X-Frame-Options: DENY` ฯลฯ
- **ขนาด:** เขียน component เองโดยไม่ใช้ UI library, Tiptap โหลดแบบ lazy เฉพาะเมื่อมี field `richText` หน้าแรกโหลดประมาณ 45 KB gzip ส่วน editor ประมาณ 122 KB gzip
- **i18n:** มีพจนานุกรม TH/EN ในตัว, label ใน config กำหนดแยกต่อภาษาได้ ภาษาที่เลือกเก็บใน `localStorage`
- **CSRF:** client อ่าน cookie `ecms-csrf` แล้วส่ง header `x-csrf-token` ทุกครั้งที่เขียนข้อมูล

## ผลที่ตามมา
- ✅ แก้ config แล้วหน้า Admin เปลี่ยนตามทันทีโดยไม่ต้อง build ใหม่
- ✅ ปุ่มที่แสดงตรงกับสิทธิ์จริง ทั้งระดับ collection, เอกสาร และ field
- ❌ ต้องยิง request เพิ่มหนึ่งครั้งต่อการเปิดเอกสารเพื่อดึงสิทธิ์
- ❌ Custom field component ยังทำไม่ได้ (ตามที่บันทึกไว้ใน ADR-0002)

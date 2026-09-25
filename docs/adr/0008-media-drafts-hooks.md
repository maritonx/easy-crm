# ADR-0008: Media, drafts และ hooks

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## การตัดสินใจ

**Media**
- Collection `media` มีในตัว (ประกาศ `media` เองเพื่อเพิ่ม field, access หรือ hooks ได้) โดย metadata ของไฟล์ (`filename`, `mimeType`, `filesize`, `width`, `height`, `sizes`) ตั้งค่าได้จากการอัปโหลดเท่านั้น แก้ภายหลังได้เฉพาะ `alt` และ field ที่เพิ่มเอง
- `cms.upload()` และ `POST <api>/media` (multipart) ตรวจชนิดไฟล์จาก **เนื้อหาไฟล์** เสมอ ไม่เชื่อนามสกุลหรือ Content-Type ที่ client ส่งมา, ตรวจขนาด (413) และตั้งชื่อไฟล์ใหม่เป็น `<ชื่อ>-<สุ่ม 8 hex>.<นามสกุลตามชนิดที่ตรวจได้>` โดยตัด path ที่ส่งมาทิ้ง
- ความกว้าง/สูงอ่านจาก header ของไฟล์ (PNG/JPEG/GIF/WebP) ไม่ต้องพึ่ง sharp ส่วน `upload.imageSizes` ใช้ sharp (optional peer) ถ้าไม่ได้ติดตั้งจะแจ้งเตือนแล้วเก็บแค่ต้นฉบับ
- `StorageAdapter` (`put/get/delete/url?`) มี `localStorage` เป็น default ส่วน S3 ยกไป v0.2 ถ้า adapter ไม่มี `url()` ไฟล์จะเสิร์ฟผ่าน `GET <api>/media/file/<key>` พร้อม cache แบบ immutable, `nosniff` และ CSP `sandbox` เพื่อไม่ให้ SVG ที่อัปโหลดมารัน script ได้
- URL ของไฟล์คำนวณตอนอ่าน (afterRead hook ในตัว) ถ้าตั้ง `serverURL` จะได้ URL แบบเต็ม ลบ media แล้วไฟล์และขนาดย่อจะถูกลบไปด้วย (afterDelete ในตัว)
- `routes.api` ใน config เป็นที่เดียวที่กำหนด path ของ API (Nuxt module ไม่มี option `apiPath` แล้ว) เพื่อให้ URL ของไฟล์ตรงกับ route จริงเสมอ

**Drafts (v0.1: ไม่มี version history)**
- 1 เอกสารมี 1 ฉบับ และมี `status` เป็น `draft` หรือ `published`
- การอ่านทุกทาง (find, findById, count, populate, REST) คืนเฉพาะ `published` เป็น default ส่วน `draft: true` จะรวม draft ด้วย และทาง REST ต้อง login ก่อนเท่านั้น
- Draft ข้ามการตรวจ `required` แต่ยังตรวจชนิดข้อมูล ส่วนการ publish ต้องผ่าน validation ครบ
- หน้า Admin: เอกสารที่ published มีปุ่ม "Save" (คงสถานะ published) และ "Unpublish" ส่วนเอกสาร draft มีปุ่ม "Save draft" และ "Publish" ไม่มีการ "เก็บการแก้ไขเป็น draft ไว้ข้างหลังฉบับที่ published" (ต้องรอ versions ใน v2)

**Hooks**
- Args ของทุก hook มี `user`, `cms` (Local API) และ `slug`
- `beforeValidate` → validate → `beforeChange` → บันทึก → `afterChange` ถ้า before hook throw จะยกเลิกการบันทึก ถ้า after hook (afterChange/afterDelete) throw จะ log error แต่ไม่ย้อนการบันทึก (NFR-REL-03)
- `afterRead` ทำงานกับทุกเอกสารที่ส่งออก รวมถึงเอกสารที่ถูก populate และทำงาน**ก่อน**การตัด hidden field และ field ที่ไม่มีสิทธิ์อ่าน
- Hook ทำงานนอก DB transaction

## ผลที่ตามมา
- ✅ ใช้ Local API ตรงๆ ในฝั่ง server ได้อย่างปลอดภัย เพราะ default คืนเฉพาะที่ published
- ✅ ไฟล์ที่อัปโหลดเสิร์ฟได้เหมือนกันในทุก adapter
- ❌ แก้เอกสารที่ published แล้วยังไม่มี "draft ซ่อนอยู่ข้างหลัง" ต้องรอ v2
- ❌ Local storage ต้องมี disk ถาวร บน serverless ต้องรอ S3 adapter (v0.2)

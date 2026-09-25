# ADR-0010: S3-compatible storage (`@easy-cms/storage-s3`)

- **สถานะ:** Accepted
- **วันที่:** 2026-09-25

## บริบท

v0.1 เก็บไฟล์ upload บน local disk เท่านั้น จึงใช้บน serverless (Vercel, Netlify) และ container ที่ไม่มี volume ไม่ได้ ([ADR-0008](0008-media-drafts-hooks.md)) `StorageAdapter` ถูกออกแบบไว้รองรับแล้ว (`put/get/delete/url?/init?`)

## การตัดสินใจ

- แยกเป็น package `@easy-cms/storage-s3` ตามที่ DESIGN กำหนด ผู้ใช้ local storage ไม่ต้องติดตั้งอะไรเพิ่ม
- ใช้ **aws4fetch** (SigV4 บน Web `fetch`, ~65 KB) แทน `@aws-sdk/client-s3` (~3.3 MB) สอดคล้องกับ core ที่เป็น Web-standard และใช้กับ AWS S3, Cloudflare R2, MinIO ได้ ส่ง request ผ่าน `fetch` ของเราเอง (`client.sign()` แล้วค่อย fetch) เพื่อให้ inject `fetch` ในเทสต์ได้
- **อ่าน credentials ตอน `init()`** ไม่ใช่ตอนสร้าง adapter เพราะ Nuxt module และ `withEasyCMS` import config ตอน build ซึ่งอาจยังไม่มี env
- ค่า default ของ credentials/region มาจาก `AWS_*` ตามธรรมเนียมของ AWS SDK ส่วน `forcePathStyle` เปิดเองเมื่อกำหนด `endpoint` (MinIO ต้องใช้ R2 รองรับ)
- **ค่าเริ่มต้นเสิร์ฟไฟล์ผ่าน API** (`<api>/media/file/<key>`) จาก bucket แบบ private จึงได้ header ป้องกัน SVG (CSP `sandbox`, `nosniff`) เหมือน local storage ส่วน `publicUrl` ให้ชี้ไป CDN/bucket โดยตรง และเอกสารแนะนำให้ใช้คนละโดเมนกับเว็บ เพราะ header เหล่านั้นไม่ถูกใส่ที่ต้นทางนั้น
- เทสต์สองชั้น: unit test ด้วย fake `fetch` (URL, การเข้ารหัส key ภาษาไทย, ลายเซ็น, error) และ integration test กับ S3 server จริงเมื่อมี `S3_TEST_ENDPOINT` CI ใช้ **RustFS** (ตรวจ SigV4 จริง) เพราะ MinIO เลิกเผยแพร่ Docker image แล้ว

## ผลที่ตามมา

- ✅ Deploy บน serverless ได้เมื่อใช้คู่กับ Postgres ภายนอก
- ✅ Bucket เป็น private ได้โดยไม่ต้องตั้ง policy
- ❌ โหมด default ทุก request ของไฟล์ผ่าน server ของเว็บ ควรมี CDN ด้านหน้า หรือใช้ `publicUrl`
- ❌ อ่านไฟล์ทั้งก้อนเข้า memory (ขนาดสูงสุดตาม `upload.maxFileSize`) ยังไม่ stream

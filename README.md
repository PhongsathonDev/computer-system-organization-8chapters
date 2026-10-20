# CS:ORG — แบบฝึกหัดเติมคำ 8 บท 

เว็บไซต์แบบฝึกหัดโครงสร้างระบบคอมพิวเตอร์ (020413106) แบบไฟล์เดียว
ไม่ต้องติดตั้ง dependencies ไม่ต้อง build และไม่ต้องมี backend

## ไฟล์ในโฟลเดอร์นี้

- `index.html` — ตัวเว็บทั้งหมด รวม HTML, CSS, JavaScript และชุดคำถาม
- `.nojekyll` — ปิดการประมวลผล Jekyll ของ GitHub Pages

## วิธี host ด้วย GitHub Pages

1. สร้าง repository ใหม่บน GitHub (เลือก Public)
2. อัปโหลด **ไฟล์ทั้งหมดในโฟลเดอร์นี้** ไปไว้ที่ root ของ repository
3. ไปที่ **Settings → Pages**
4. ที่ **Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
5. กด **Save** แล้วรอประมาณ 1–2 นาที
6. เปิดเว็บที่ `https://<username>.github.io/<repository>/`

## การอัปเดตเว็บ

แก้ไข `index.html` แล้วอัปโหลดทับไฟล์เดิมใน repository
GitHub Pages จะแสดงเวอร์ชันใหม่ให้เองภายในไม่กี่นาที

## หมายเหตุ

- ตัวเว็บโหลดฟอนต์จาก Google Fonts จึงควรมีอินเทอร์เน็ตขณะใช้งาน
- ถ้าเปลี่ยนชื่อ repository ภายหลัง URL ของเว็บจะเปลี่ยนตาม

@AGENTS.md

---

# ATURAN MUTLAK — KONTRAK KERJA

Aturan di bawah ini mengikat dan tidak perlu diulang oleh user di setiap percakapan.
Berlaku sampai user mengubahnya secara eksplisit di file ini.

## 1. Frasa pemicu: "silahkan mengoding"

Ketika user menulis **"silahkan mengoding"**, itu adalah **izin penuh untuk melakukan CRUD**
(create, read, update, delete) di **seluruh folder root `gakkum/`**:

```
gakkum/
├── app/            ├── lib/          ├── backend/       (Python/FastAPI/Scapy)
├── components/     ├── types/        ├── bin/           (launcher)
├── hooks/          ├── public/       ├── docs/
├── package.json, tsconfig.json, next.config.*, .env*, AGENTS.md, CLAUDE.md
```

Bukan hanya `backend/`. Jangan menunggu konfirmasi per-file saat frasa itu muncul —
langsung kerjakan sampai selesai, termasuk file baru dan penghapusan file yang sudah
tidak terpakai.

## 2. Tanpa frasa itu: JANGAN mengoding

Selama user belum menulis "silahkan mengoding", **jangan mengubah kode apa pun** —
tidak ada edit, tidak ada file baru, tidak ada `git` yang memodifikasi working tree.
Yang boleh dilakukan hanya hal yang tidak mengubah kode:

- membaca file, grep, glob, inspeksi runtime
- menjalankan perintah baca-saja (`/health`, query DB, dump payload WS)
- menulis dokumen rencana di `docs/`
- menjawab pertanyaan dan memberi analisis

Kalau analisis sudah selesai dan implementasi berikutnya jelas, **berhenti dan tunggu**
frasa pemicunya. Jangan menawarkan diri untuk "langsung mulai" lalu mengerjakannya.

## 3. Batas wilayah

Root `gakkum/` adalah batas CRUD. Di luar itu (`node_modules/`, folder lain di
`D:\programmingProject\`, file sistem, konfigurasi global) **tidak boleh disentuh**
tanpa izin eksplisit user.

Pengecualian yang diizinkan tanpa bertanya: menjalankan build/test/dev server yang
menulis ke `node_modules/`, `.next/`, `__pycache__/`, atau log runtime di `backend/`.

## 4. Jalur kerja yang disepakati

Rancangan implementasi ada di `backend/docs/SCAN_ENGINE_REDESIGN.md`.
Saat frasa pemicu muncul, ikuti urutan fase di dokumen itu (Fase 0 → 6), bukan
urutan yang dikarang sendiri. Kalau di tengah jalan rancangan perlu diubah, perbarui
dokumennya **dalam commit/pekerjaan yang sama** supaya dokumen tidak pernah
tertinggal dari kode.

## 5. Verifikasi wajib

Backend berjalan tanpa `--reload` (`bin/gakkum.js`). Setiap perubahan Python **tidak
berlaku sampai proses di-restart**. Jangan pernah mengklaim sebuah perubahan backend
sudah bekerja tanpa restart lebih dulu, dan jangan mengklaim sesuatu berfungsi tanpa
membuktikannya lewat `/health`, payload WebSocket, atau log.

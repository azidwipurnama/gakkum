# Menjalankan Gakkum Dashboard

Untuk menjalankan aplikasi ini secara penuh, pastikan komponen berikut berjalan:

1. **Backend (Python)**:
   - Pastikan lingkungan virtual aktif (jika ada) dan dependensi terpasang.
   - Perintah: `cd backend && python main.py`
   - Pastikan file `.env` di folder `gakkum` sudah dikonfigurasikan dengan benar (Supabase URL, API Key).

2. **Frontend (Next.js)**:
   - Perintah: `cd D:\programmingProject\vscode\laragon\www\gakkum && npm run dev`

3. **Database (Supabase)**:
   - Pastikan Supabase instance Anda online dan kredensial di `.env` backend sesuai.

4. **Monitor Agent** (Opsional untuk data real-time):
   - Perintah: `cd scripts/monitor_agent && python monitor_agent.py`
   - Pastikan `.env` di dalam `scripts/monitor_agent/` telah dikonfigurasi dengan URL backend (`SERVER_URL=http://localhost:8000/api/agent/report`) dan API Key yang cocok.

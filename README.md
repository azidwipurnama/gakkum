This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Pemantauan Jaringan (monitoring)

Fitur ini membandingkan kondisi jaringan sekarang dengan baseline 30 hari, bukan
sekadar menampilkan data mentah. Setiap 15 menit backend menulis snapshot dan
menjalankan aturan perbandingan.

### Persiapan sekali jalan

Tabel dan view-nya tidak dibuat otomatis. Jalankan **manual** di SQL Editor Supabase:

```
schema/migration_monitoring.sql
```

Selama belum dijalankan, siklus tetap berjalan tetapi hasilnya tidak tersimpan —
panel Pemantauan akan menampilkan peringatan "Tabel pemantauan belum dibuat".

### Melihat hasil dan proses

| Tempat | Isi |
| --- | --- |
| Tombol **Pemantauan** di status bar dasbor | Panel: status siklus, interval, kesiapan baseline, jumlah perangkat terlacak, perangkat baru/hilang, lonjakan trafik, dan riwayat temuan |
| `backend/server.log` | Prosesnya: baris `[MONITOR] siklus #N selesai dalam Xs, Y temuan` dan satu baris per temuan |
| Supabase | Data mentah: `device_snapshots`, `device_activity`, `ssid_events`, `monitoring_alerts` |

Tombol **Jalankan sekarang** di panel memicu satu siklus tanpa menunggu interval.

### Endpoint REST

Semua butuh `?api_key=GAKKUM_SECRET_KEY`.

```
GET  /api/monitoring/status
GET  /api/monitoring/summary
GET  /api/monitoring/alerts?limit=50
GET  /api/monitoring/device/{mac}/history?days=7
POST /api/monitoring/run
```

### Aturan yang dijalankan

| Aturan | Perbandingan | Aktif sejak |
| --- | --- | --- |
| `new_device` | MAC tidak pernah muncul sebelum 24 jam terakhir | baseline ≥ 24 jam |
| `device_disappeared` | MAC ada di baseline tapi absen 24 jam | baseline ≥ 24 jam |
| `traffic_spike` | Paket hari ini ≥ 2× rata-rata harian 7 hari | baseline ≥ 24 jam |
| `latency_shift` | Latensi sekarang ≥ 3× p95 baseline | langsung |
| `bssid_change` | SSID sama, BSSID berbeda dalam 7 hari | langsung |

Temuan yang identik dalam 6 jam terakhir tidak ditulis ulang. Riwayat lebih tua
dari 7 hari dihapus otomatis oleh backend (tanpa pg_cron).

Konfigurasi ada di [backend/config.py](backend/config.py) pada blok
`--- Fitur Monitoring ---`.

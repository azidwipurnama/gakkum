"""Registry ruangan <-> Access Point.

INI SATU-SATUNYA FILE yang perlu diubah saat daftar BSSID asli sudah ada.
Cukup isi field "bssid" pada setiap AP di bawah; backend (lokasi device,
current_room) dan frontend (denah + titik device) membaca dari sini.

Semantik penting
----------------
Adapter Wi-Fi laptop monitoring hanya bisa melihat BSSID AP tempat ia
terhubung (lihat wifi_bssid.py). Tidak ada cara mengetahui AP mana yang
dipakai tiap perangkat tanpa konfigurasi di sisi router/AP. Karena itu
"ruangan" di sini berarti: ruangan tempat laptop monitoring berada saat
perangkat tersebut terlihat. Nilai ini dipakai untuk menyaring titik pada
denah, bukan untuk melacak posisi fisik perangkat secara presisi.

Menambah ruangan baru
---------------------
Salin salah satu entri di ROOMS, ganti id/label/floorplan, lalu isi daftar
aps. Jika denahnya belum tersedia, biarkan "floorplan": None; frontend akan
menampilkan skema AP sederhana sampai gambar denahnya ditambahkan ke
folder public/.
"""

# Koordinat x/y memakai satuan user unit SVG (lihat "view_box" ruangan).
# Nilai di bawah diambil dari marker <g transform="translate(x y)"> pada
# public/setdit.svg.
ROOMS = {
    "setdit": {
        "label": "Setdit",
        "floorplan": "/setdit.svg",
        "view_box": "0 0 465 655",
        "aps": [
            # TODO(bssid): ganti placeholder AA:BB:CC:DD:EE:xx dengan BSSID asli.
            {"id": "setdit-ap1", "label": "AP 1", "bssid": "AA:BB:CC:DD:EE:01", "x": 181, "y": 94},
            {"id": "setdit-ap2", "label": "AP 2", "bssid": "AA:BB:CC:DD:EE:02", "x": 288, "y": 94},
            {"id": "setdit-ap3", "label": "AP 3", "bssid": "AA:BB:CC:DD:EE:03", "x": 382, "y": 187},
            {"id": "setdit-ap4", "label": "AP 4", "bssid": "AA:BB:CC:DD:EE:04", "x": 181, "y": 236},
            {"id": "setdit-ap5", "label": "AP 5", "bssid": "AA:BB:CC:DD:EE:05", "x": 181, "y": 551},
            {"id": "setdit-ap6", "label": "AP 6", "bssid": "AA:BB:CC:DD:EE:06", "x": 308, "y": 551},
        ],
    },
    "psph": {
        "label": "PSPH",
        # TODO(denah): ganti dengan path SVG PSPH setelah gambarnya tersedia,
        # mis. "/psph.svg", lalu isi x/y tiap AP.
        "floorplan": None,
        "view_box": None,
        "aps": [
            # TODO(bssid): isi BSSID asli AP PSPH.
            {"id": "psph-ap1", "label": "AP 1", "bssid": "AA:BB:CC:DD:EE:11", "x": None, "y": None},
        ],
    },
}


def normalize_bssid(bssid):
    """Samakan format BSSID: huruf kecil dan pemisah titik dua.

    get_host_bssid() mengembalikan huruf kecil, sedangkan daftar di atas
    ditulis dengan huruf besar. Normalisasi membuat keduanya cocok.
    """
    return (bssid or "").strip().lower().replace("-", ":")


# Semua BSSID contoh di atas memakai prefix ini. Selama AP masih memakai
# placeholder, frontend menampilkan peringatan "BSSID masih placeholder".
PLACEHOLDER_BSSID_PREFIX = "aa:bb:cc:dd:ee"


def is_placeholder_bssid(bssid):
    return normalize_bssid(bssid).startswith(PLACEHOLDER_BSSID_PREFIX)



def _build_index():
    index = {}
    for room_id, room in ROOMS.items():
        for ap in room["aps"]:
            key = normalize_bssid(ap.get("bssid"))
            if not key:
                continue
            index[key] = {
                "room_id": room_id,
                "room_label": room["label"],
                "ap_id": ap["id"],
                "ap_label": ap["label"],
            }
    return index


# bssid (ternormalisasi) -> info ruangan/AP
BSSID_INDEX = _build_index()

# bssid (ternormalisasi) -> label ruangan. Dipakai sebagai pengganti
# BSSID_MAPPING lama di config.py agar hanya ada satu sumber data.
BSSID_TO_LOCATION = {key: info["room_label"] for key, info in BSSID_INDEX.items()}

ROOM_LABELS = {room_id: room["label"] for room_id, room in ROOMS.items()}


def room_for_bssid(bssid):
    """Kembalikan info ruangan untuk sebuah BSSID, atau None jika tak dikenal."""
    return BSSID_INDEX.get(normalize_bssid(bssid))


def room_id_for_bssid(bssid):
    info = room_for_bssid(bssid)
    return info["room_id"] if info else ""


def room_label_for_bssid(bssid):
    info = room_for_bssid(bssid)
    return info["room_label"] if info else "Unknown"


def room_label(room_id):
    return ROOM_LABELS.get(room_id or "", "Unknown")


def public_rooms():
    """Registry untuk frontend: koordinat denah, tanpa BSSID.

    BSSID tidak perlu dikirim ke browser karena penyaringan dilakukan per
    room_id; menyembunyikannya juga menjaga payload tetap ringkas.
    """
    rooms = []
    for room_id, room in ROOMS.items():
        aps = [
            {
                "id": ap["id"],
                "label": ap["label"],
                "x": ap.get("x"),
                "y": ap.get("y"),
                "has_bssid": bool(ap.get("bssid")) and not is_placeholder_bssid(ap.get("bssid")),
            }
            for ap in room["aps"]
        ]
        rooms.append({
            "id": room_id,
            "label": room["label"],
            "floorplan": room.get("floorplan"),
            "view_box": room.get("view_box"),
            "aps": aps,
        })
    return rooms

"""Pembentukan payload upsert Supabase untuk tabel devices.

Modul ini sengaja tidak mengimpor Supabase, FastAPI, atau Scapy supaya bisa
diuji tanpa kredensial dan tanpa menyentuh jaringan.

BSSID tidak pernah dikirim ke Supabase. BSSID hanya dipakai secara internal
oleh engine untuk pemetaan lokasi (lihat apply_host_bssid dan
BSSID_MAPPING_NORMALIZED di timestamp_engine.py).
"""

# Kolom tabel devices yang dikirim saat upsert. 'bssid' sengaja TIDAK ada di sini.
DEVICE_UPSERT_FIELDS = ("ip", "hostname", "category", "vendor", "location")


def build_device_upsert_payload(devices):
    """
    Ubah daftar device dari payload engine menjadi payload upsert tabel devices.
    Hanya kolom di DEVICE_UPSERT_FIELDS yang disertakan.
    """
    prepared_devices = []
    for dev in devices:
        dev_data = {"id": dev.get("mac")}  # MAC address dipakai sebagai unique ID
        for field in DEVICE_UPSERT_FIELDS:
            dev_data[field] = dev.get(field)
        prepared_devices.append(dev_data)
    return prepared_devices

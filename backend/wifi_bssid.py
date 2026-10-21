import subprocess
import re
import platform
import os

_last_location_warning_logged = False

def get_host_bssid():
    """
    Membaca BSSID AP yang sedang dipakai host pemindai via 'netsh wlan show interfaces'
    pada sistem Windows, tanpa membuka jendela konsol dan tanpa shell=True.
    Mengembalikan BSSID ternormalisasi (huruf kecil, pemisah ':') atau None.
    """
    global _last_location_warning_logged
    if platform.system() != "Windows":
        return None

    try:
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0 # SW_HIDE

        result = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True,
            timeout=5,
            startupinfo=startupinfo,
            text=True,
            errors="replace"
        )

        output = result.stdout or ""

        # Periksa indikasi izin lokasi Windows nonaktif
        if ("location" in output.lower() or "izin" in output.lower() or "lokasi" in output.lower()) and not _last_location_warning_logged:
            # Periksa apakah ada indikasi pemblokiran lokasi
            if "not allowed" in output.lower() or "diperlukan" in output.lower() or "disabled" in output.lower():
                print("[WARNING] Izin Lokasi Windows mungkin nonaktif, BSSID tidak bisa dibaca")
                _last_location_warning_logged = True

        # Cari baris yang berlabel BSSID (mendukung bahasa Inggris dan Indonesia: "BSSID" atau variasi label)
        # Contoh baris: "    BSSID                  : aa:bb:cc:dd:ee:ff"
        for line in output.splitlines():
            if "bssid" in line.lower():
                parts = line.split(":", 1)
                if len(parts) == 2:
                    raw_bssid = parts[1].strip()
                    # Normalisasi ke huruf kecil, ganti strip dengan colon jika ada
                    normalized = raw_bssid.replace('-', ':').lower()
                    # Validasi regex MAC/BSSID: ^([0-9a-f]{2}:){5}[0-9a-f]{2}$
                    if re.match(r'^([0-9a-f]{2}:){5}[0-9a-f]{2}$', normalized):
                        return normalized
    except subprocess.TimeoutExpired:
        print("[DEBUG] netsh wlan show interfaces timeout expired")
    except Exception as e:
        print(f"[DEBUG] Error reading host BSSID: {e}")

    return None

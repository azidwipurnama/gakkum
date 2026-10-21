"""Parsing output `ping` Windows menjadi nilai latency.

Modul ini sengaja tidak mengimpor Scapy, FastAPI, atau Supabase supaya bisa
diuji tanpa kredensial dan tanpa menyentuh jaringan.

Latar belakang: `sniffer.py` memakai `ping -n 1 -w 500 <ip>` milik Windows.
Windows berbahasa Inggris menulis `time=12ms` / `time<1ms`, sedangkan Windows
berbahasa Indonesia menulis `waktu=12ms` / `waktu<1ms`. Parser lama hanya
mengenali bentuk Inggris sehingga hasil pengukuran selalu jatuh ke nilai
default 0. Parser ini tidak pernah mengembalikan 0 untuk kegagalan.
"""

import re


class _LatencyMarker:
    """Penanda hasil pengukuran yang bukan angka ms biasa."""

    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return self.name


# Pengukuran gagal: timeout, host unreachable, output kosong/tidak dikenali,
# atau subprocess ping berhenti dengan exit code gagal. Ini bukan 0 ms.
LATENCY_FAILED = _LatencyMarker("LATENCY_FAILED")

# Terukur di bawah 1 ms (Windows menulis "time<1ms" / "waktu<1ms"). Makna ini
# dipertahankan apa adanya, tidak dinaikkan menjadi 1 ms.
LATENCY_BELOW_1MS = _LatencyMarker("LATENCY_BELOW_1MS")

# "time=12ms", "time<1ms", "waktu=12ms", "WAKTU=5MS".
# Sufiks "mdtk"/"mdetik" ikut diterima sebagai variasi lokalisasi.
_LATENCY_PATTERN = re.compile(
    r"(?:time|waktu)\s*([=<])\s*(\d+(?:[.,]\d+)?)\s*(?:ms|mdtk|mdetik)\b",
    re.IGNORECASE,
)

# Penanda kegagalan milik Windows (Inggris dan Indonesia).
_FAILURE_MARKERS = (
    "timed out",
    "timeout",
    "unreachable",
    "tidak dapat dijangkau",
    "tidak dapat menjangkau",
    "habis waktu",
    "waktu habis",
    "100% loss",
    "100% susut",
)


def parse_ping_latency(output):
    """
    Ubah output `ping` Windows menjadi nilai latency.

    Kembalian:
      angka ms (int/float) : latency terukur. Nilai 0 di sini berarti benar-benar
                             terukur 0 ms, bukan kegagalan.
      LATENCY_BELOW_1MS    : terukur di bawah 1 ms
      LATENCY_FAILED       : gagal atau output tidak dikenali
    """
    if not output:
        return LATENCY_FAILED

    match = _LATENCY_PATTERN.search(output)
    if match:
        operator, raw_value = match.group(1), match.group(2)
        if operator == "<":
            # Windows hanya menulis bentuk "<" untuk hasil sub-milidetik.
            return LATENCY_BELOW_1MS
        value = float(raw_value.replace(",", "."))
        return int(value) if value.is_integer() else value

    lowered = output.lower()
    for marker in _FAILURE_MARKERS:
        if marker in lowered:
            return LATENCY_FAILED

    # Output kosong atau tidak dikenali: jangan pernah dianggap 0 ms.
    return LATENCY_FAILED

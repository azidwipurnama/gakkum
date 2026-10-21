import threading
import queue
import time
import socket
import subprocess
import random
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from config import (
    WORKER_THREAD_COUNT,
    WORKER_QUEUE_MAXSIZE,
    SUPABASE_MAX_ATTEMPTS,
    HOSTNAME_TIMEOUT_SECONDS,
    PING_TIMEOUT_SECONDS,
)
from ping_parser import parse_ping_latency

class BackgroundWorkers:
    def __init__(self, supabase_client=None):
        self.supabase = supabase_client
        self.queue = queue.Queue(maxsize=WORKER_QUEUE_MAXSIZE)
        self.shutdown_event = threading.Event()
        self.threads = []

        # Statistics
        self.stats = {
            "submitted": 0,
            "completed": 0,
            "failed": 0,
            "dropped": 0
        }
        self._stats_lock = threading.Lock()

    def start(self):
        print(f"[WORKERS] Starting {WORKER_THREAD_COUNT} worker threads...")
        for i in range(WORKER_THREAD_COUNT):
            t = threading.Thread(target=self._worker_loop, name=f"Worker-{i}", daemon=True)
            t.start()
            self.threads.append(t)

    def stop(self):
        print("[WORKERS] Stopping background workers...")
        self.shutdown_event.set()
        for t in self.threads:
            t.join(timeout=1.0)

    def submit(self, name, fn, *args):
        """Non-blocking submission of a task to the worker queue."""
        with self._stats_lock:
            self.stats["submitted"] += 1

        try:
            # Put task into queue without blocking. If full, it raises queue.Full.
            self.queue.put_nowait((name, fn, args))
        except queue.Full:
            print(f"[WARN] worker queue penuh, tugas dibuang: {name}")
            with self._stats_lock:
                self.stats["dropped"] += 1

    def _worker_loop(self):
        while not self.shutdown_event.is_set():
            try:
                # Use timeout to allow checking shutdown_event periodically
                task = self.queue.get(timeout=0.5)
                name, fn, args = task

                try:
                    fn(*args)
                    with self._stats_lock:
                        self.stats["completed"] += 1
                except Exception as e:
                    print(f"[WORKER ERROR] Task {name} failed: {e}")
                    with self._stats_lock:
                        self.stats["failed"] += 1
                finally:
                    self.queue.task_done()

            except queue.Empty:
                continue
            except Exception as e:
                print(f"[WORKER CRITICAL] Loop error: {e}")

    def get_stats(self):
        with self._stats_lock:
            s = self.stats.copy()
            s["queued"] = self.queue.qsize()
            s["alive_workers"] = sum(1 for t in self.threads if t.is_alive())
            return s

# --- Synchronous Helpers ---

def resolve_hostname(ip):
    """DNS resolution with strict timeout using a temporary executor."""
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(socket.gethostbyaddr, ip)
        try:
            return future.result(timeout=HOSTNAME_TIMEOUT_SECONDS)[0]
        except (FutureTimeoutError, Exception):
            return "Unknown"

def ping_latency(ip):
    """Synchronous ping to get latency, using the system ping tool."""
    try:
        result = subprocess.run(
            f"ping -n 1 -w 500 {ip}",
            shell=True,
            capture_output=True,
            text=True,
            timeout=PING_TIMEOUT_SECONDS
        )
        return parse_ping_latency(result.stdout + result.stderr)
    except Exception:
        from ping_parser import LATENCY_FAILED
        return LATENCY_FAILED

def persist_rows(supabase, table, payload, mode="upsert"):
    """
    Synchronous Supabase persistence with exponential backoff and jitter.
    """
    if not supabase or not payload:
        return

    attempt = 0
    while attempt < SUPABASE_MAX_ATTEMPTS:
        try:
            table_ref = supabase.table(table)
            if mode == "upsert":
                table_ref.upsert(payload).execute()
            elif mode == "insert":
                table_ref.insert(payload).execute()
            elif mode == "update":
                table_ref.update(payload).execute()
            return

        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "too many requests" in error_msg:
                attempt += 1
                if attempt >= SUPABASE_MAX_ATTEMPTS:
                    print(f"[CRITICAL] Supabase 429: Max attempts reached for {table}. Giving up.")
                    break

                sleep_time = (2 ** (attempt - 1)) + random.uniform(0, 1)
                print(f"[WARNING] Supabase 429 on {table}. Retrying in {sleep_time:.2f}s (Attempt {attempt}/{SUPABASE_MAX_ATTEMPTS})")
                time.sleep(sleep_time)
            else:
                print(f"[ERROR] Supabase persistence error on {table}: {e}")
                break

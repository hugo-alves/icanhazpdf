import json
import sqlite3
import threading
import time
from typing import Any


class Cache:
    def __init__(self, path: str) -> None:
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER)"
        )
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
            if not row:
                return None
            value, expires_at = row
            if expires_at is not None and expires_at < now:
                self._conn.execute("DELETE FROM cache WHERE key = ?", (key,))
                self._conn.commit()
                return None
        return json.loads(value)

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        expires_at = None
        if ttl_seconds is not None:
            expires_at = int(time.time()) + int(ttl_seconds)
        payload = json.dumps(value)
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, payload, expires_at),
            )
            self._conn.commit()

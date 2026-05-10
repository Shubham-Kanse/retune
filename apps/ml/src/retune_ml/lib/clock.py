"""Process-wide monotonic clock helpers."""

from __future__ import annotations

import time

_PROCESS_START = time.monotonic()


def uptime_seconds() -> float:
    """Seconds since this process started."""
    return time.monotonic() - _PROCESS_START


def now_ms() -> float:
    """Current monotonic time in milliseconds (for latency measurement)."""
    return time.monotonic() * 1000.0

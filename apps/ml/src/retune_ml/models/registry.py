"""Model registry.

Each cognitive subsystem in the techspec maps to one or more models.
The registry lazy-loads them, pins their versions, and exposes a single
manifest endpoint that returns what's loaded right now.

Commit #1 ships only stubs. Real model loading lands per-subsystem
in subsequent commits.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ModelHandle:
    """A loaded (or stubbed) model and its pinned version."""

    name: str
    version: str
    is_stub: bool

    def display(self) -> str:
        suffix = " [stub]" if self.is_stub else ""
        return f"{self.name}@{self.version}{suffix}"


class ModelRegistry:
    """Lazy, thread-safe model loader."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded: dict[str, ModelHandle] = {}

    def list_loaded(self) -> list[str]:
        with self._lock:
            return [h.display() for h in self._loaded.values()]

    def get(self, name: str) -> ModelHandle:
        with self._lock:
            if name in self._loaded:
                return self._loaded[name]
            handle = self._load(name)
            self._loaded[name] = handle
            return handle

    def _load(self, name: str) -> ModelHandle:
        # Commit #1: every model is a stub. Real loaders land alongside
        # their respective endpoints (commit #3+).
        if name == "bge-large-en-v1.5":
            return ModelHandle(name=name, version="0.1.0-stub", is_stub=True)
        raise ValueError(f"unknown model: {name}")


_registry: ModelRegistry | None = None


def get_registry() -> ModelRegistry:
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
    return _registry

"""ruleprobe_client — thin HTTP wrapper for ruleprobe serve."""
from __future__ import annotations
import urllib.request
import urllib.parse
import urllib.error
import json
from typing import Any


DEFAULT_BASE_URL = "http://localhost:3000"


class RuleProbeClient:
    """HTTP client for a running `ruleprobe serve` instance."""

    def __init__(self, base_url: str = DEFAULT_BASE_URL) -> None:
        self.base_url = base_url.rstrip("/")

    def rules(self, dir: str = ".") -> list[dict[str, Any]]:
        """GET /ruleprobe/rules — return extracted rules for *dir*."""
        url = f"{self.base_url}/ruleprobe/rules?dir={urllib.parse.quote(dir)}"
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read())

    def run(self, dir: str = ".", provider: str = "mock") -> list[dict[str, Any]]:
        """POST /ruleprobe/run — run compliance tests and return results."""
        payload = json.dumps({"dir": dir, "provider": provider}).encode()
        req = urllib.request.Request(
            f"{self.base_url}/ruleprobe/run",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())

    def score(self, dir: str = ".", provider: str = "mock") -> int:
        """Run compliance tests and return the overall integer score (0-100)."""
        results = self.run(dir=dir, provider=provider)
        if not results:
            return 0
        scores = [r.get("score", 0) for r in results if r.get("status") != "SKIPPED"]
        return round(sum(scores) / len(scores)) if scores else 0

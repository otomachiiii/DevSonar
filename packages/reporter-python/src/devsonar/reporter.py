from __future__ import annotations

import json
import logging
import os
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("devsonar")


class ErrorReporter:
    """Sends error reports to DevSonar relay server."""

    def __init__(
        self,
        relay_url: Optional[str] = None,
        enabled: bool = True,
        timeout: float = 1.0,
        debug: bool = False,
    ) -> None:
        self.relay_url = relay_url or os.environ.get("DEVSONAR_URL", "http://localhost:9100")
        self.enabled = enabled
        self.timeout = timeout
        self.debug = debug

    def report(
        self,
        message: str,
        stack: str = "",
        source: str = "python",
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Send an error report to the relay server."""
        if not self.enabled:
            return

        payload: Dict[str, Any] = {
            "message": message,
            "stack": stack,
            "source": source,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if context:
            payload["context"] = context

        self._send(payload)

    def report_exception(
        self,
        exc: BaseException,
        source: str = "python",
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Send an exception report to the relay server."""
        message = f"{type(exc).__name__}: {exc}"
        stack = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        self.report(message=message, stack=stack, source=source, context=context)

    def _send(self, payload: Dict[str, Any]) -> None:
        url = f"{self.relay_url}/errors"
        data = json.dumps(payload).encode("utf-8")

        req = Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")

        try:
            urlopen(req, timeout=self.timeout)
        except (URLError, OSError) as e:
            if self.debug:
                logger.debug("Failed to send error report: %s", e)

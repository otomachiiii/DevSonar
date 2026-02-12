from __future__ import annotations

import sys
import threading
from types import TracebackType
from typing import Optional, Type

from devsonar.reporter import ErrorReporter

_original_excepthook = sys.excepthook
_original_threading_excepthook = getattr(threading, "excepthook", None)


def install(reporter: ErrorReporter) -> None:
    """Install sys.excepthook and threading.excepthook to report uncaught exceptions."""

    def devsonar_excepthook(
        exc_type: Type[BaseException],
        exc_value: BaseException,
        exc_tb: Optional[TracebackType],
    ) -> None:
        reporter.report_exception(exc_value, source="python-excepthook")
        _original_excepthook(exc_type, exc_value, exc_tb)

    sys.excepthook = devsonar_excepthook

    if hasattr(threading, "excepthook"):
        def devsonar_threading_excepthook(args: threading.ExceptHookArgs) -> None:
            if args.exc_value is not None:
                reporter.report_exception(args.exc_value, source="python-thread-excepthook")
            if _original_threading_excepthook is not None:
                _original_threading_excepthook(args)

        threading.excepthook = devsonar_threading_excepthook

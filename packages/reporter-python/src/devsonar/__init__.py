"""DevSonar - AI-powered error reporter for Python."""

from __future__ import annotations

from typing import Optional

from devsonar.reporter import ErrorReporter

_reporter: Optional[ErrorReporter] = None


def init(
    relay_url: Optional[str] = None,
    enabled: bool = True,
    timeout: float = 1.0,
    debug: bool = False,
) -> ErrorReporter:
    """Initialize DevSonar error reporting with sys.excepthook integration.

    Args:
        relay_url: DevSonar relay server URL. Defaults to DEVSONAR_URL env var or http://localhost:9100.
        enabled: Enable/disable reporting.
        timeout: HTTP request timeout in seconds.
        debug: Enable debug logging.

    Returns:
        The initialized ErrorReporter instance.
    """
    global _reporter
    _reporter = ErrorReporter(
        relay_url=relay_url,
        enabled=enabled,
        timeout=timeout,
        debug=debug,
    )
    from devsonar.excepthook import install
    install(_reporter)
    return _reporter


def report_error(
    message: str,
    stack: str = "",
    source: str = "python",
    context: Optional[dict] = None,
) -> None:
    """Report an error to DevSonar relay server.

    Args:
        message: Error message.
        stack: Stack trace string.
        source: Error source identifier.
        context: Additional context dictionary.
    """
    global _reporter
    if _reporter is None:
        _reporter = ErrorReporter()
    _reporter.report(message=message, stack=stack, source=source, context=context)


__all__ = ["init", "report_error", "ErrorReporter"]

from __future__ import annotations

from typing import Any

from devsonar.reporter import ErrorReporter


def init_devsonar(app: Any, **kwargs: Any) -> ErrorReporter:
    """Initialize DevSonar error reporting for a Flask application.

    Args:
        app: Flask application instance.
        **kwargs: Arguments passed to ErrorReporter constructor.

    Returns:
        The initialized ErrorReporter instance.
    """
    reporter = ErrorReporter(**kwargs)

    @app.errorhandler(Exception)
    def handle_exception(e: Exception) -> Any:
        reporter.report_exception(
            e,
            source="flask",
        )
        raise

    return reporter

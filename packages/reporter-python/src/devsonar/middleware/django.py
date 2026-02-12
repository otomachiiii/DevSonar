from __future__ import annotations

from typing import Any, Callable

from devsonar.reporter import ErrorReporter


class DevSonarMiddleware:
    """Django middleware that reports unhandled exceptions to DevSonar."""

    def __init__(self, get_response: Callable[..., Any]) -> None:
        self.get_response = get_response
        self.reporter = ErrorReporter()

    def __call__(self, request: Any) -> Any:
        return self.get_response(request)

    def process_exception(self, request: Any, exception: Exception) -> None:
        self.reporter.report_exception(
            exception,
            source="django",
            context={
                "method": request.method,
                "path": request.path,
            },
        )

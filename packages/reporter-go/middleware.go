package devsonar

import (
	"fmt"
	"net/http"
)

// Middleware returns an http.Handler middleware that recovers from panics and reports them to DevSonar.
func Middleware(reporter *Reporter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					reporter.ReportPanic(recovered, "go-http-middleware")

					w.WriteHeader(http.StatusInternalServerError)
					fmt.Fprint(w, "Internal Server Error")
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}

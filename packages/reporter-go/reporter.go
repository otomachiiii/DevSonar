// Package devsonar provides error reporting for Go applications to the DevSonar relay server.
package devsonar

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"
)

// Reporter sends error reports to the DevSonar relay server.
type Reporter struct {
	RelayURL string
	Enabled  bool
	Timeout  time.Duration
	Debug    bool
}

// Option configures a Reporter.
type Option func(*Reporter)

// WithRelayURL sets the relay server URL.
func WithRelayURL(u string) Option {
	return func(r *Reporter) {
		r.RelayURL = u
	}
}

// WithTimeout sets the HTTP request timeout.
func WithTimeout(d time.Duration) Option {
	return func(r *Reporter) {
		r.Timeout = d
	}
}

// WithDebug enables debug logging.
func WithDebug(debug bool) Option {
	return func(r *Reporter) {
		r.Debug = debug
	}
}

// New creates a new Reporter with the given options.
// Default RelayURL is read from DEVSONAR_URL env var, or "http://localhost:9100".
func New(opts ...Option) *Reporter {
	relayURL := os.Getenv("DEVSONAR_URL")
	if relayURL == "" {
		relayURL = "http://localhost:9100"
	}

	r := &Reporter{
		RelayURL: relayURL,
		Enabled:  true,
		Timeout:  time.Second,
		Debug:    false,
	}

	for _, opt := range opts {
		opt(r)
	}

	return r
}

type errorReport struct {
	Message   string         `json:"message"`
	Stack     string         `json:"stack,omitempty"`
	Source    string         `json:"source,omitempty"`
	Timestamp string         `json:"timestamp"`
	Context   map[string]any `json:"context,omitempty"`
}

// Report sends a custom error report to the relay server.
func (r *Reporter) Report(message, stack, source string, context map[string]any) error {
	if !r.Enabled {
		return nil
	}

	report := errorReport{
		Message:   message,
		Stack:     stack,
		Source:    source,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Context:   context,
	}

	return r.send(report)
}

// ReportError reports a Go error to the relay server.
func (r *Reporter) ReportError(err error, source string) error {
	if !r.Enabled || err == nil {
		return nil
	}

	stack := captureStack(3)
	return r.Report(err.Error(), stack, source, nil)
}

// ReportPanic reports a recovered panic value to the relay server.
func (r *Reporter) ReportPanic(recovered any, source string) error {
	if !r.Enabled || recovered == nil {
		return nil
	}

	message := fmt.Sprintf("panic: %v", recovered)
	stack := captureStack(4)
	return r.Report(message, stack, source, map[string]any{
		"language":    "go",
		"detectedVia": "recover",
	})
}

func (r *Reporter) send(report errorReport) error {
	data, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("devsonar: marshal error: %w", err)
	}

	u, err := url.JoinPath(r.RelayURL, "errors")
	if err != nil {
		return fmt.Errorf("devsonar: invalid relay URL: %w", err)
	}
	client := &http.Client{Timeout: r.Timeout}

	resp, err := client.Post(u, "application/json", bytes.NewReader(data))
	if err != nil {
		if r.Debug {
			fmt.Fprintf(os.Stderr, "[DevSonar] Failed to send error report: %v\n", err)
		}
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		if r.Debug {
			fmt.Fprintf(os.Stderr, "[DevSonar] Relay returned status %d\n", resp.StatusCode)
		}
	}

	return nil
}

func captureStack(skip int) string {
	var buf strings.Builder
	pcs := make([]uintptr, 32)
	n := runtime.Callers(skip, pcs)
	frames := runtime.CallersFrames(pcs[:n])

	for {
		frame, more := frames.Next()
		fmt.Fprintf(&buf, "%s\n\t%s:%d\n", frame.Function, frame.File, frame.Line)
		if !more {
			break
		}
	}

	return buf.String()
}

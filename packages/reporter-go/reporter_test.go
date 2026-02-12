package devsonar

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNew_DefaultRelayURL(t *testing.T) {
	r := New()
	if r.RelayURL != "http://localhost:9100" {
		t.Errorf("expected default relay URL, got %s", r.RelayURL)
	}
	if !r.Enabled {
		t.Error("expected Enabled to be true by default")
	}
}

func TestNew_WithOptions(t *testing.T) {
	r := New(WithRelayURL("http://custom:8080"), WithDebug(true))
	if r.RelayURL != "http://custom:8080" {
		t.Errorf("expected custom relay URL, got %s", r.RelayURL)
	}
	if !r.Debug {
		t.Error("expected Debug to be true")
	}
}

func TestReport_SendsToRelay(t *testing.T) {
	var received errorReport

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"received": 1}`))
	}))
	defer server.Close()

	r := New(WithRelayURL(server.URL))
	err := r.Report("test error", "stack trace", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Message != "test error" {
		t.Errorf("expected message 'test error', got '%s'", received.Message)
	}
	if received.Stack != "stack trace" {
		t.Errorf("expected stack 'stack trace', got '%s'", received.Stack)
	}
	if received.Source != "test" {
		t.Errorf("expected source 'test', got '%s'", received.Source)
	}
}

func TestReportError(t *testing.T) {
	var received errorReport

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	r := New(WithRelayURL(server.URL))
	err := r.ReportError(errors.New("something went wrong"), "test-source")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Message != "something went wrong" {
		t.Errorf("expected error message, got '%s'", received.Message)
	}
}

func TestReportPanic(t *testing.T) {
	var received errorReport

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	r := New(WithRelayURL(server.URL))
	err := r.ReportPanic("something panicked", "test-source")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if received.Message != "panic: something panicked" {
		t.Errorf("expected panic message, got '%s'", received.Message)
	}
}

func TestDisabledReporter(t *testing.T) {
	r := New()
	r.Enabled = false

	err := r.Report("test", "", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRecoverAndReport(t *testing.T) {
	var received errorReport

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &received)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	reporter := New(WithRelayURL(server.URL))

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic to be re-raised")
		}
		if received.Message != "panic: test panic" {
			t.Errorf("expected panic report, got '%s'", received.Message)
		}
	}()

	func() {
		defer RecoverAndReport(reporter, "test")
		panic("test panic")
	}()
}

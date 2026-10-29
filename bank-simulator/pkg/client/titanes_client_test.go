package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"titanes-portfolio/bank-simulator/pkg/models"
)

func TestClientSendTransactionSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Webhook-Secret") != "test_secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/api/webhooks/mobile-transaction" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true, "message": "Transaction synced successfully"}`))
	}))
	defer ts.Close()

	cli := NewClient(ts.URL, "test_secret", 2*time.Second)
	tx := &models.ParsedTransaction{
		Bank:        "Nu Colombia",
		Account:     "Cuenta Nu Débito (Nómina)",
		Amount:      45000,
		Type:        models.TypeDebit,
		Description: "Compra Éxito",
	}

	res, err := cli.SendTransaction(context.Background(), tx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !res.Success {
		t.Errorf("expected success, got false: %s", res.Error)
	}

	if res.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", res.StatusCode)
	}

	if res.BackendMessage != "Transaction synced successfully" {
		t.Errorf("unexpected message: %s", res.BackendMessage)
	}
}

func TestClientRetryOnServerError(t *testing.T) {
	var attempts int32

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&attempts, 1)
		if count < 2 {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"detail": "temporary duckdb lock"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true, "message": "Recovered on retry"}`))
	}))
	defer ts.Close()

	cli := NewClient(ts.URL, "test_secret", 2*time.Second)
	tx := &models.ParsedTransaction{
		Bank:    "RappiPay",
		Amount:  9400,
		Type:    models.TypeDebit,
		Account: "Cuenta Rappi (Principal)",
	}

	res, err := cli.SendTransaction(context.Background(), tx)
	if err != nil {
		t.Fatalf("unexpected error after retry: %v", err)
	}

	if !res.Success {
		t.Errorf("expected success on second attempt")
	}

	if attempts != 2 {
		t.Errorf("expected exactly 2 attempts, got %d", attempts)
	}
}

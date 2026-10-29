package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"titanes-portfolio/bank-simulator/pkg/client"
	"titanes-portfolio/bank-simulator/pkg/models"
	"titanes-portfolio/bank-simulator/pkg/parser"
)

func TestServerEndpoints(t *testing.T) {
	// Mock backend server
	mockBackend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success": true, "message": "Synced to DuckDB"}`))
	}))
	defer mockBackend.Close()

	engine := parser.NewEngine()
	apiClient := client.NewClient(mockBackend.URL, "test_secret", 2*time.Second)
	broker := NewBroker()
	server := NewServer(engine, apiClient, broker, "127.0.0.1", 8080)
	handler := server.Handler()

	t.Run("GET / serves index.html", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if !bytes.Contains(rec.Body.Bytes(), []byte("Titanes Simulator")) {
			t.Errorf("expected HTML to contain 'Titanes Simulator'")
		}
	})

	t.Run("GET /api/status", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var status map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &status); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if status["app"] == "" {
			t.Errorf("expected app name in status")
		}
	})

	t.Run("GET /api/presets", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/presets", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var presets []models.SimulatedPreset
		if err := json.Unmarshal(rec.Body.Bytes(), &presets); err != nil {
			t.Fatalf("failed to decode presets: %v", err)
		}
		if len(presets) < 10 {
			t.Errorf("expected at least 10 presets, got %d", len(presets))
		}
	})

	t.Run("POST /api/presets/trigger", func(t *testing.T) {
		body := bytes.NewBufferString(`{"id": "nu-salary"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/presets/trigger", body)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if res["success"] != true {
			t.Errorf("expected success true, got %v", res)
		}
	})

	t.Run("POST /api/notifications/incoming (Mobile Webhook)", func(t *testing.T) {
		payload := `{"app_name":"Nubank","title":"Nubank","text":"Compra aprobada en EXITO CALLE 170 por $45.000 con tu tarjeta Nu"}`
		req := httptest.NewRequest(http.MethodPost, "/api/notifications/incoming", bytes.NewBufferString(payload))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d. Body: %s", rec.Code, rec.Body.String())
		}
		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if res["success"] != true {
			t.Errorf("expected success true, got %v", res)
		}
	})

	t.Run("POST /api/config/backend", func(t *testing.T) {
		body := bytes.NewBufferString(`{"base_url": "https://titanes-portfolio-backend.onrender.com"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/config/backend", body)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var res map[string]any
		json.Unmarshal(rec.Body.Bytes(), &res)
		if res["target_url"] != "https://titanes-portfolio-backend.onrender.com" {
			t.Errorf("unexpected target url: %v", res["target_url"])
		}
	})
}

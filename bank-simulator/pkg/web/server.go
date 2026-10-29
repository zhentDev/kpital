package web

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"titanes-portfolio/bank-simulator/pkg/client"
	"titanes-portfolio/bank-simulator/pkg/models"
	"titanes-portfolio/bank-simulator/pkg/parser"
	"titanes-portfolio/bank-simulator/pkg/simulator"
)

//go:embed static/*
var staticFS embed.FS

// Server is the HTTP server providing the web UI, REST API, and SSE streaming.
type Server struct {
	mux       *http.ServeMux
	parser    *parser.Engine
	client    *client.Client
	broker    *Broker
	presets   []models.SimulatedPreset
	localIP   string
	port      int
	startTime time.Time
}

// NewServer creates and initializes the Web and API server.
func NewServer(engine *parser.Engine, apiClient *client.Client, broker *Broker, localIP string, port int) *Server {
	s := &Server{
		mux:       http.NewServeMux(),
		parser:    engine,
		client:    apiClient,
		broker:    broker,
		presets:   simulator.GetDefaultPresets(),
		localIP:   localIP,
		port:      port,
		startTime: time.Now(),
	}

	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	// Web Interface (Embedded HTML/CSS/JS)
	s.mux.HandleFunc("GET /", s.handleIndex)

	// API Endpoints
	s.mux.HandleFunc("GET /api/status", s.handleStatus)
	s.mux.HandleFunc("GET /api/presets", s.handlePresets)
	s.mux.HandleFunc("POST /api/presets/trigger", s.handleTriggerPreset)
	s.mux.HandleFunc("POST /api/notifications/incoming", s.handleIncomingNotification)
	s.mux.HandleFunc("GET /api/logs/stream", s.broker.ServeHTTP)
	s.mux.HandleFunc("POST /api/config/backend", s.handleConfigBackend)
	s.mux.HandleFunc("POST /api/telegram/test", s.handleTelegramTest)
}

// Handler returns the HTTP handler wrapped with CORS and logging.
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		s.mux.ServeHTTP(w, r)
	})
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	data, err := staticFS.ReadFile("static/index.html")
	if err != nil {
		http.Error(w, "Error loading UI asset", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := map[string]any{
		"app":            "Titanes Bank Simulator & Notification Gateway",
		"version":        "1.0.0",
		"local_ip":       s.localIP,
		"port":           s.port,
		"access_url":     fmt.Sprintf("http://%s:%d", s.localIP, s.port),
		"target_backend": s.client.BaseURL(),
		"total_presets":  len(s.presets),
		"uptime_sec":     int64(time.Since(s.startTime).Seconds()),
	}
	s.jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handlePresets(w http.ResponseWriter, r *http.Request) {
	s.jsonResponse(w, http.StatusOK, s.presets)
}

type triggerRequest struct {
	ID            string  `json:"id"`
	CustomTitle   string  `json:"custom_title,omitempty"`
	CustomText    string  `json:"custom_text,omitempty"`
	CustomAmount  float64 `json:"custom_amount,omitempty"`
	CustomAccount string  `json:"custom_account,omitempty"`
}

func (s *Server) handleTriggerPreset(w http.ResponseWriter, r *http.Request) {
	var req triggerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.jsonError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}

	var raw models.RawNotification
	var bank string

	preset, err := simulator.FindPresetByID(req.ID)
	if err == nil {
		raw = models.RawNotification{
			AppName:   preset.Bank,
			Title:     preset.Title,
			Text:      preset.Text,
			Timestamp: time.Now(),
		}
		bank = preset.Bank
	} else {
		// Direct custom trigger without preset
		if req.CustomTitle == "" && req.CustomText == "" {
			s.jsonError(w, http.StatusNotFound, fmt.Sprintf("Preset '%s' not found and no custom text provided", req.ID))
			return
		}
		raw = models.RawNotification{
			AppName:   "Manual Simulator",
			Title:     req.CustomTitle,
			Text:      req.CustomText,
			Timestamp: time.Now(),
		}
	}

	// Override if customized
	if req.CustomTitle != "" {
		raw.Title = req.CustomTitle
	}
	if req.CustomText != "" {
		raw.Text = req.CustomText
	}

	s.broker.Broadcast("INFO", "SIMULATOR", fmt.Sprintf("Triggered simulation: [%s] %s", bank, raw.Text), raw)

	// Parse through engine
	parsed, err := s.parser.Parse(raw)
	if err != nil {
		s.broker.Broadcast("ERROR", "PARSER", fmt.Sprintf("Parsing error: %v", err), raw)
		s.jsonError(w, http.StatusUnprocessableEntity, fmt.Sprintf("Parser failed: %v", err))
		return
	}

	if req.CustomAmount > 0 {
		parsed.Amount = req.CustomAmount
	}
	if req.CustomAccount != "" {
		parsed.Account = req.CustomAccount
	}

	s.broker.Broadcast("SUCCESS", "PARSER", fmt.Sprintf("Parsed %s | %s $%.0f COP | Target: %s", parsed.Bank, parsed.Type, parsed.Amount, parsed.Account), parsed)

	// Dispatch to Titanes FastAPI
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	dispatchRes, dispatchErr := s.client.SendTransaction(ctx, parsed)
	if dispatchErr != nil {
		s.broker.Broadcast("WARN", "BACKEND_DISPATCH", fmt.Sprintf("Backend dispatch warning: %v (Latency: %dms)", dispatchErr, dispatchRes.LatencyMs), dispatchRes)
	} else {
		s.broker.Broadcast("SUCCESS", "BACKEND_DISPATCH", fmt.Sprintf("Successfully dispatched to FastAPI! Code %d (%dms): %s", dispatchRes.StatusCode, dispatchRes.LatencyMs, dispatchRes.BackendMessage), dispatchRes)
	}

	s.jsonResponse(w, http.StatusOK, map[string]any{
		"success":  true,
		"preset":   req.ID,
		"raw":      raw,
		"parsed":   parsed,
		"dispatch": dispatchRes,
	})
}

func (s *Server) handleIncomingNotification(w http.ResponseWriter, r *http.Request) {
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		s.jsonError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	var raw models.RawNotification
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		s.broker.Broadcast("ERROR", "WEBHOOK", "Malformed JSON from mobile notification listener", string(bodyBytes))
		s.jsonError(w, http.StatusBadRequest, "Invalid JSON notification payload")
		return
	}

	if raw.Timestamp.IsZero() {
		raw.Timestamp = time.Now()
	}

	s.broker.Broadcast("INFO", "MOBILE_WEBHOOK", fmt.Sprintf("Received notification from %s: '%s' - '%s'", raw.AppName, raw.Title, raw.Text), raw)

	// Parse incoming notification
	parsed, err := s.parser.Parse(raw)
	if err != nil {
		s.broker.Broadcast("WARN", "PARSER", fmt.Sprintf("Could not parse notification text: %v", err), raw)
		s.jsonResponse(w, http.StatusOK, map[string]any{
			"success": false,
			"message": "Notification not recognized or no monetary amount detected",
			"error":   err.Error(),
		})
		return
	}

	s.broker.Broadcast("SUCCESS", "PARSER", fmt.Sprintf("Extracted: %s | %s $%0.f | %s", parsed.Bank, parsed.Type, parsed.Amount, parsed.Description), parsed)

	// Forward to FastAPI
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	dispatchRes, dispatchErr := s.client.SendTransaction(ctx, parsed)
	if dispatchErr != nil {
		s.broker.Broadcast("ERROR", "BACKEND_DISPATCH", fmt.Sprintf("FastAPI dispatch error: %v", dispatchErr), dispatchRes)
	} else {
		s.broker.Broadcast("SUCCESS", "BACKEND_DISPATCH", fmt.Sprintf("Sync OK with Titanes Portfolio (%dms)", dispatchRes.LatencyMs), dispatchRes)
	}

	s.jsonResponse(w, http.StatusOK, map[string]any{
		"success":  true,
		"parsed":   parsed,
		"dispatch": dispatchRes,
	})
}

type backendConfigRequest struct {
	BaseURL string `json:"base_url"`
}

func (s *Server) handleConfigBackend(w http.ResponseWriter, r *http.Request) {
	var req backendConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.jsonError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	s.client.UpdateBaseURL(req.BaseURL)
	s.broker.Broadcast("INFO", "CONFIG", fmt.Sprintf("Updated target backend to: %s", s.client.BaseURL()), nil)

	s.jsonResponse(w, http.StatusOK, map[string]any{
		"success":    true,
		"target_url": s.client.BaseURL(),
	})
}

func (s *Server) handleTelegramTest(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	s.broker.Broadcast("INFO", "TELEGRAM", "Enviando solicitud de prueba de alarma Telegram a Titanes...", nil)
	res, err := s.client.TriggerTelegramTest(ctx)
	if err != nil {
		s.broker.Broadcast("ERROR", "TELEGRAM", fmt.Sprintf("Fallo al contactar FastAPI: %v", err), nil)
		s.jsonError(w, http.StatusBadGateway, fmt.Sprintf("Error comunicando con Titanes: %v", err))
		return
	}

	success, _ := res["success"].(bool)
	if success {
		s.broker.Broadcast("SUCCESS", "TELEGRAM", "✅ Alarma sonora de prueba entregada con éxito en tu Telegram!", res)
	} else {
		s.broker.Broadcast("WARN", "TELEGRAM", fmt.Sprintf("Aviso de Telegram: %v", res["error"]), res)
	}

	s.jsonResponse(w, http.StatusOK, res)
}

func (s *Server) jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (s *Server) jsonError(w http.ResponseWriter, status int, message string) {
	s.jsonResponse(w, status, map[string]any{
		"success": false,
		"error":   message,
	})
}

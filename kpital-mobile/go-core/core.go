package core

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"kpital.mobile/core/models"
	"kpital.mobile/core/parser"
)

// Config holds user credentials and endpoints for Kpital API.
type Config struct {
	ApiUrl        string `json:"apiUrl"`        // e.g., "https://titanes-portfolio-backend.onrender.com"
	WebhookSecret string `json:"webhookSecret"` // optional secret header
	UserToken     string `json:"userToken"`     // optional Supabase auth bearer token
	AutoSync      bool   `json:"autoSync"`      // whether to sync instantly over HTTP
}

// ProcessResult is the response structure exposed cleanly to Java/Kotlin.
type ProcessResult struct {
	Success      bool    `json:"success"`
	Parsed       bool    `json:"parsed"`
	Bank         string  `json:"bank"`
	Amount       float64 `json:"amount"`
	Currency     string  `json:"currency"`
	Description  string  `json:"description"`
	Account      string  `json:"account"`
	TxType       string  `json:"txType"` // "debit" (gasto) or "credit" (ingreso)
	CardLast4    string  `json:"cardLast4"`
	ErrorMessage string  `json:"errorMessage"`
}

var (
	cfgLock sync.RWMutex
	appConfig = Config{
		ApiUrl:   "https://titanes-portfolio-backend.onrender.com",
		AutoSync: true,
	}
	httpClient = &http.Client{
		Timeout: 12 * time.Second,
	}
	parserEngine = parser.NewEngine()
)

// InitConfig configures the mobile engine from Android/iOS.
func InitConfig(apiUrl, webhookSecret, userToken string, autoSync bool) {
	cfgLock.Lock()
	defer cfgLock.Unlock()

	if apiUrl != "" {
		appConfig.ApiUrl = strings.TrimRight(apiUrl, "/")
	}
	appConfig.WebhookSecret = webhookSecret
	appConfig.UserToken = userToken
	appConfig.AutoSync = autoSync
}

// ProcessNotification takes a push notification intercepted by Android/iOS
// parses it in Go, extracts all financial details, and syncs it with Kpital.
func ProcessNotification(packageName, title, text string, timestampMs int64) *ProcessResult {
	res := &ProcessResult{
		Success:  false,
		Currency: "COP",
	}

	if title == "" && text == "" {
		res.ErrorMessage = "Empty notification title and text"
		return res
	}

	rawTime := time.Now()
	if timestampMs > 0 {
		rawTime = time.UnixMilli(timestampMs)
	}

	rawNotif := models.RawNotification{
		PackageName: packageName,
		Title:       title,
		Text:        text,
		Timestamp:   rawTime,
	}

	// 1. Run through the specialized Colombian banking regex parser
	parsedTx, err := parserEngine.Parse(rawNotif)
	if err != nil {
		res.ErrorMessage = fmt.Sprintf("Parser error: %v", err)
		return res
	}

	if parsedTx == nil {
		res.ErrorMessage = "Notification does not match supported bank transaction patterns"
		return res
	}

	res.Parsed = true
	res.Bank = parsedTx.Bank
	res.Amount = parsedTx.Amount
	res.Currency = parsedTx.Currency
	res.Description = parsedTx.Description
	res.Account = parsedTx.Account
	res.TxType = string(parsedTx.Type)

	// Extract last 4 card digits if present
	if strings.Contains(parsedTx.Account, "*") {
		parts := strings.Split(parsedTx.Account, "*")
		if len(parts) > 1 {
			res.CardLast4 = parts[len(parts)-1]
		}
	}

	// 2. Dispatch to Kpital Backend via Webhook / REST if autoSync is active
	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	if currentCfg.AutoSync && currentCfg.ApiUrl != "" {
		sendErr := syncTransactionToBackend(currentCfg, rawNotif, parsedTx)
		if sendErr != nil {
			res.ErrorMessage = fmt.Sprintf("Parsed OK, but backend sync failed: %v", sendErr)
			// Return parsed data so Android can cache it locally for retry
			res.Success = false
			return res
		}
	}

	res.Success = true
	return res
}

// ProcessNotificationJSON is a helper that returns a JSON string for easy Android JNI interop.
func ProcessNotificationJSON(packageName, title, text string, timestampMs int64) string {
	res := ProcessNotification(packageName, title, text, timestampMs)
	bytes, err := json.Marshal(res)
	if err != nil {
		return `{"success":false,"errorMessage":"JSON marshal error"}`
	}
	return string(bytes)
}

// syncTransactionToBackend sends the parsed notification payload to Kpital.
func syncTransactionToBackend(cfg Config, raw models.RawNotification, parsed *models.ParsedTransaction) error {
	endpoint := fmt.Sprintf("%s/api/webhooks/mobile/notification", cfg.ApiUrl)

	payload := map[string]interface{}{
		"app_name":     parsed.Bank,
		"package_name": raw.PackageName,
		"title":        raw.Title,
		"body":         raw.Text,
		"timestamp":    raw.Timestamp.Format(time.RFC3339),
		"amount":       parsed.Amount,
		"description":  parsed.Description,
		"account":      parsed.Account,
		"tx_type":      parsed.Type,
		"source":       "kpital_mobile_native",
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if cfg.WebhookSecret != "" {
		req.Header.Set("X-Webhook-Secret", cfg.WebhookSecret)
	}
	if cfg.UserToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", cfg.UserToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

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

// ParseNotificationJSON parses the push notification text without immediately sending it,
// allowing Android to display the interactive pocket picker dialog to the user.
func ParseNotificationJSON(packageName, title, text string, timestampMs int64) string {
	res := &ProcessResult{
		Success:  false,
		Currency: "COP",
	}

	if title == "" && text == "" {
		res.ErrorMessage = "Empty notification title and text"
		bytes, _ := json.Marshal(res)
		return string(bytes)
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

	parsedTx, err := parserEngine.Parse(rawNotif)
	if err != nil {
		res.ErrorMessage = fmt.Sprintf("Parser error: %v", err)
		bytes, _ := json.Marshal(res)
		return string(bytes)
	}

	if parsedTx == nil {
		res.ErrorMessage = "Notification does not match supported bank transaction patterns"
		bytes, _ := json.Marshal(res)
		return string(bytes)
	}

	res.Success = true
	res.Parsed = true
	res.Bank = parsedTx.Bank
	res.Amount = parsedTx.Amount
	res.Currency = parsedTx.Currency
	res.Description = parsedTx.Description
	res.Account = parsedTx.Account
	res.TxType = string(parsedTx.Type)

	if strings.Contains(parsedTx.Account, "*") {
		parts := strings.Split(parsedTx.Account, "*")
		if len(parts) > 1 {
			res.CardLast4 = parts[len(parts)-1]
		}
	}

	bytes, _ := json.Marshal(res)
	return string(bytes)
}

// SendTransactionToBackend dispatches the user-confirmed transaction and selected pocket to Kpital.
func SendTransactionToBackend(bank, account, description, txType string, amount float64, rawText string) string {
	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-transaction", currentCfg.ApiUrl)

	payload := map[string]interface{}{
		"entity":      bank,
		"account":     account,
		"amount":      amount,
		"description": description,
		"type":        txType,
		"raw_text":    rawText,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}

	req.Header.Set("Content-Type", "application/json")
	if currentCfg.WebhookSecret != "" {
		req.Header.Set("X-Webhook-Secret", currentCfg.WebhookSecret)
	} else {
		// Default secure mobile token
		req.Header.Set("X-Webhook-Secret", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
	}
	if currentCfg.UserToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", currentCfg.UserToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	return string(bodyBytes)
}

// FetchMobilePockets calls /api/webhooks/mobile-pockets to retrieve available pockets for a bank.
func FetchMobilePockets(bank, txType string) string {
	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-pockets?bank=%s&tx_type=%s", currentCfg.ApiUrl, bank, txType)
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return `{"success":false,"pockets":[]}`
	}

	if currentCfg.WebhookSecret != "" {
		req.Header.Set("X-Webhook-Secret", currentCfg.WebhookSecret)
	} else {
		req.Header.Set("X-Webhook-Secret", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
	}
	if currentCfg.UserToken != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", currentCfg.UserToken))
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return `{"success":false,"pockets":[]}`
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	return string(bodyBytes)
}

// LoginToKpital authenticates the user directly against the Kpital API and returns token & profile.
func LoginToKpital(email, password string) string {
	cfgLock.RLock()
	apiUrl := appConfig.ApiUrl
	cfgLock.RUnlock()

	endpoint := fmt.Sprintf("%s/api/auth/login", apiUrl)
	payload := map[string]string{
		"email":    email,
		"password": password,
	}

	jsonBytes, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	return string(bodyBytes)
}

// syncTransactionToBackend sends the parsed notification payload to Kpital.
func syncTransactionToBackend(cfg Config, raw models.RawNotification, parsed *models.ParsedTransaction) error {
	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-transaction", cfg.ApiUrl)

	payload := map[string]interface{}{
		"entity":      parsed.Bank,
		"account":     parsed.Account,
		"amount":      parsed.Amount,
		"description": parsed.Description,
		"type":        string(parsed.Type),
		"raw_text":    raw.Text,
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
	} else {
		req.Header.Set("X-Webhook-Secret", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
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

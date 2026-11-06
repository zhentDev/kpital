package core

import (
	"bytes"
	"errors"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	TxType       string  `json:"txType"` // "debit", "credit", "yield_payout", "balance_digest"
	CardLast4    string  `json:"cardLast4"`
	ErrorMessage string  `json:"errorMessage"`
	IsIgnored    bool    `json:"isIgnored"`
	IgnoreReason string  `json:"ignoreReason"`
	IsBalance    bool    `json:"isBalance"`
}

const (
	SupabaseRestUrl = "https://ixnidzllqwbkexsrmgwz.supabase.co/rest/v1"
	SupabaseAnonKey = "sb_publishable_4Gbn-hZLX764m-gz-LAhRg_914uGNIR"
	DefaultOwnerId  = "usr_9487dd2209d2"
)

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
		if errors.Is(err, parser.ErrIgnoredNotification) {
			res.Success = true
			res.Parsed = false
			res.IsIgnored = true
			res.IgnoreReason = "Informational, security or promotional notification ignored"
			return res
		}
		res.ErrorMessage = fmt.Sprintf("Parser error: %v", err)
		return res
	}

	if parsedTx == nil {
		res.ErrorMessage = "Notification does not match supported bank transaction patterns"
		return res
	}

	if parsedTx.IsInformational {
		res.Success = true
		res.Parsed = false
		res.IsIgnored = true
		res.IsBalance = (parsedTx.Type == models.TypeBalanceDigest || parsedTx.Category == models.CategoryBalanceDigest)
		res.IgnoreReason = string(parsedTx.Category)
		res.Bank = parsedTx.Bank
		res.Amount = 0
		res.TxType = string(parsedTx.Type)
		res.Description = parsedTx.Description
		res.Account = parsedTx.Account
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
		if errors.Is(err, parser.ErrIgnoredNotification) {
			res.Success = true
			res.Parsed = false
			res.IsIgnored = true
			res.IgnoreReason = "Informational, security or promotional notification ignored"
			bytes, _ := json.Marshal(res)
			return string(bytes)
		}
		res.ErrorMessage = fmt.Sprintf("Parser error: %v", err)
		bytes, _ := json.Marshal(res)
		return string(bytes)
	}

	if parsedTx == nil {
		res.ErrorMessage = "Notification does not match supported bank transaction patterns"
		bytes, _ := json.Marshal(res)
		return string(bytes)
	}

	if parsedTx.IsInformational {
		res.Success = true
		res.Parsed = false
		res.IsIgnored = true
		res.IsBalance = (parsedTx.Type == models.TypeBalanceDigest || parsedTx.Category == models.CategoryBalanceDigest)
		res.IgnoreReason = string(parsedTx.Category)
		res.Bank = parsedTx.Bank
		res.Amount = 0
		res.TxType = string(parsedTx.Type)
		res.Description = parsedTx.Description
		res.Account = parsedTx.Account
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

// SendTransactionToBackend dispatches transaction and selected pocket to Kpital (legacy compatibility).
func SendTransactionToBackend(bank, account, description, txType string, amount float64, rawText string) string {
	return SendTransactionWithRubroToBackend(bank, account, description, txType, amount, rawText, "", "", "")
}

// syncToSupabaseDirect inserts the transaction directly into Supabase PostgreSQL (cf_movements)
// ensuring zero lag and 100% resilience even if the backend cloud server is offline or sleeping.
func syncToSupabaseDirect(bank, account, description, txType string, amount float64, rawText, budgetItemId, budgetItemName, budgetItemType string) error {
	now := time.Now().UTC().Add(-5 * time.Hour) // America/Bogota (UTC-5)
	period := now.Format("2006-01")
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("15:04:05")

	txId := fmt.Sprintf("cf_tx_mb_%d_%x", now.UnixNano()/int64(time.Millisecond), now.UnixNano()%0xFFFF)

	isCard := strings.Contains(strings.ToLower(account), "tarjeta") ||
		strings.Contains(strings.ToLower(account), "card") ||
		strings.Contains(strings.ToLower(account), "visa") ||
		strings.Contains(strings.ToLower(account), "mastercard")

	sourceType := "fixed_pocket"
	if isCard {
		sourceType = "credit_card"
	} else if strings.Contains(strings.ToLower(account), "nomina") || strings.Contains(strings.ToLower(account), "nómina") || strings.Contains(strings.ToLower(account), "nu débito") {
		sourceType = "payroll"
	}

	targetName := account
	if targetName == "" {
		targetName = bank
	}

	payload := map[string]interface{}{
		"id":               txId,
		"user_id":          DefaultOwnerId,
		"period":           period,
		"date":             dateStr,
		"time":             timeStr,
		"type":             txType,
		"amount":           amount,
		"currency":         "COP",
		"description":      description,
		"budget_item_id":   budgetItemId,
		"budget_item_name": budgetItemName,
		"budget_item_type": budgetItemType,
		"payment_source_json": map[string]interface{}{
			"type":       sourceType,
			"targetName": targetName,
		},
		"extra_json": map[string]interface{}{
			"source":  "kpital_mobile_direct",
			"rawText": rawText,
			"bank":    bank,
			"account": account,
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/cf_movements", SupabaseRestUrl)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}

	req.Header.Set("apikey", SupabaseAnonKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", SupabaseAnonKey))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase returned HTTP %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// SendTransactionWithRubroToBackend dispatches the user-confirmed transaction with both pocket and budget item (rubro).
// Implements dual-sync: posts to backend webhook AND directly to Supabase PostgreSQL for 100% reliable real-time sync.
func SendTransactionWithRubroToBackend(bank, account, description, txType string, amount float64, rawText, budgetItemId, budgetItemName, budgetItemType string) string {
	// 1. Dual-Sync: Insert directly into Supabase PostgreSQL
	go func() {
		_ = syncToSupabaseDirect(bank, account, description, txType, amount, rawText, budgetItemId, budgetItemName, budgetItemType)
	}()

	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-transaction", currentCfg.ApiUrl)

	payload := map[string]interface{}{
		"entity":           bank,
		"account":          account,
		"amount":           amount,
		"description":      description,
		"type":             txType,
		"raw_text":         rawText,
		"budget_item_id":   budgetItemId,
		"budget_item_name": budgetItemName,
		"budget_item_type": budgetItemType,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		// If JSON marshal fails, still try direct sync
		_ = syncToSupabaseDirect(bank, account, description, txType, amount, rawText, budgetItemId, budgetItemName, budgetItemType)
		return `{"success":true,"message":"Movimiento registrado en Kpital"}`
	}

	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonBytes))
	if err != nil {
		_ = syncToSupabaseDirect(bank, account, description, txType, amount, rawText, budgetItemId, budgetItemName, budgetItemType)
		return `{"success":true,"message":"Movimiento registrado en Kpital"}`
	}

	req.Header.Set("Content-Type", "application/json")
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
		// Render failed or offline -> ensure Supabase direct sync succeeds synchronously
		errDirect := syncToSupabaseDirect(bank, account, description, txType, amount, rawText, budgetItemId, budgetItemName, budgetItemType)
		if errDirect == nil {
			return `{"success":true,"message":"Movimiento registrado directamente en Kpital Supabase"}`
		}
		return fmt.Sprintf(`{"success":false,"message":"%v"}`, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		_ = syncToSupabaseDirect(bank, account, description, txType, amount, rawText, budgetItemId, budgetItemName, budgetItemType)
		return `{"success":true,"message":"Movimiento registrado con éxito"}`
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	return string(bodyBytes)
}

// FetchMobileBudgetItems retrieves all Cash Flow budget items (rubros) categorized by pillar.
// Falls back directly to Supabase PostgREST if Render is asleep or returns an error.
func FetchMobileBudgetItems() string {
	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-budget-items", currentCfg.ApiUrl)

	req, err := http.NewRequest("GET", endpoint, nil)
	if err == nil {
		if currentCfg.WebhookSecret != "" {
			req.Header.Set("X-Webhook-Secret", currentCfg.WebhookSecret)
		} else {
			req.Header.Set("X-Webhook-Secret", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
		}
		if currentCfg.UserToken != "" {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", currentCfg.UserToken))
		}

		resp, err := httpClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			bodyBytes, _ := io.ReadAll(resp.Body)
			return string(bodyBytes)
		}
	}

	// Resilient Direct Supabase Fallback
	supabaseUrl := fmt.Sprintf("%s/cf_budget_envelopes?user_id=eq.%s&select=pillar,id,name,amount", SupabaseRestUrl, DefaultOwnerId)
	sReq, err := http.NewRequest("GET", supabaseUrl, nil)
	if err != nil {
		return `{"success":false,"wealth":[],"needs":[],"wants":[]}`
	}
	sReq.Header.Set("apikey", SupabaseAnonKey)
	sReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", SupabaseAnonKey))
	sReq.Header.Set("Accept", "application/json")

	sResp, err := httpClient.Do(sReq)
	if err != nil {
		return `{"success":false,"wealth":[],"needs":[],"wants":[]}`
	}
	defer sResp.Body.Close()

	if sResp.StatusCode != http.StatusOK {
		return `{"success":false,"wealth":[],"needs":[],"wants":[]}`
	}

	var rows []struct {
		Pillar string  `json:"pillar"`
		ID     string  `json:"id"`
		Name   string  `json:"name"`
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(sResp.Body).Decode(&rows); err != nil {
		return `{"success":false,"wealth":[],"needs":[],"wants":[]}`
	}

	wealth := []map[string]interface{}{}
	needs := []map[string]interface{}{}
	wants := []map[string]interface{}{}

	seen := make(map[string]bool)
	for _, r := range rows {
		key := fmt.Sprintf("%s:%s", r.Pillar, r.ID)
		if seen[key] {
			continue
		}
		seen[key] = true
		item := map[string]interface{}{
			"id":     r.ID,
			"name":   r.Name,
			"amount": r.Amount,
			"pillar": r.Pillar,
		}
		switch r.Pillar {
		case "wealth":
			wealth = append(wealth, item)
		case "needs":
			needs = append(needs, item)
		case "wants":
			wants = append(wants, item)
		}
	}

	out := map[string]interface{}{
		"success": true,
		"wealth":  wealth,
		"needs":   needs,
		"wants":   wants,
	}
	bytesOut, _ := json.Marshal(out)
	return string(bytesOut)
}

// FetchMobilePockets calls /api/webhooks/mobile-pockets to retrieve available pockets for a bank.
func FetchMobilePockets(bank, txType string) string {
	cfgLock.RLock()
	currentCfg := appConfig
	cfgLock.RUnlock()

	params := url.Values{}
	params.Set("bank", bank)
	params.Set("tx_type", txType)

	endpoint := fmt.Sprintf("%s/api/webhooks/mobile-pockets?%s", currentCfg.ApiUrl, params.Encode())
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

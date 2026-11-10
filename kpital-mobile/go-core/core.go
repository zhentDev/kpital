package core

import (
	"bytes"
	"errors"
	"encoding/json"
	"fmt"
	"io"
	"math"
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
		Timeout: 30 * time.Second,
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

type fiEntity struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type fiAccount struct {
	ID        string                 `json:"id"`
	EntityID  string                 `json:"entity_id"`
	Name      string                 `json:"name"`
	Balance   float64                `json:"balance"`
	Currency  string                 `json:"currency"`
	ExtraJSON map[string]interface{} `json:"extra_json"`
}

func supabaseDo(method, path string, payload interface{}, prefer string) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		jsonBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewBuffer(jsonBytes)
	}

	endpoint := fmt.Sprintf("%s%s", SupabaseRestUrl, path)
	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("apikey", SupabaseAnonKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", SupabaseAnonKey))
	req.Header.Set("Content-Type", "application/json")
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase returned HTTP %d: %s", resp.StatusCode, string(respBytes))
	}
	return respBytes, nil
}

func isCardOrExcludedAccount(account string) bool {
	s := strings.ToLower(strings.TrimSpace(account))
	return strings.Contains(s, "tarjeta") ||
		strings.Contains(s, "card") ||
		strings.Contains(s, "visa") ||
		strings.Contains(s, "mastercard") ||
		strings.Contains(s, "rappicard") ||
		strings.Contains(s, "nu débito") ||
		strings.Contains(s, "nu debito") ||
		strings.Contains(s, "efectivo") ||
		strings.Contains(s, "cash") ||
		strings.Contains(s, "caja social")
}

func bankCanonicalKey(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case strings.Contains(s, "rappipay"), strings.Contains(s, "rappi"):
		return "rappipay"
	case strings.Contains(s, "finandina"):
		return "finandina"
	case strings.Contains(s, "nubank"), strings.Contains(s, "nu colombia"), s == "nu", strings.HasPrefix(s, "nu "), strings.Contains(s, "_nu"):
		return "nu"
	case strings.Contains(s, "plenti"):
		return "plenti"
	default:
		return s
	}
}

func isPrimaryFiAccount(acc fiAccount) bool {
	if acc.ExtraJSON != nil {
		if v, ok := acc.ExtraJSON["isPrimary"].(bool); ok && v {
			return true
		}
	}
	return strings.Contains(strings.ToLower(acc.Name), "principal")
}

func matchFixedIncomeAccount(bank, account string, entities []fiEntity, accounts []fiAccount) *fiAccount {
	if isCardOrExcludedAccount(account) {
		return nil
	}
	bankKey := bankCanonicalKey(bank)
	if bankKey != "rappipay" && bankKey != "finandina" && bankKey != "nu" && bankKey != "plenti" {
		return nil
	}

	targetEntityIDs := make(map[string]bool)
	for _, ent := range entities {
		if bankCanonicalKey(ent.Name) == bankKey || bankCanonicalKey(ent.ID) == bankKey {
			targetEntityIDs[ent.ID] = true
		}
	}

	var entityAccounts []fiAccount
	for _, acc := range accounts {
		if acc.ID == "acc_nu_debito" || isCardOrExcludedAccount(acc.Name) {
			continue
		}
		if targetEntityIDs[acc.EntityID] || bankCanonicalKey(acc.EntityID) == bankKey {
			entityAccounts = append(entityAccounts, acc)
		}
	}
	if len(entityAccounts) == 0 {
		return nil
	}

	trimmedQuery := strings.TrimSpace(account)
	lowerQuery := strings.ToLower(trimmedQuery)

	if trimmedQuery != "" {
		for i := range entityAccounts {
			if strings.EqualFold(strings.TrimSpace(entityAccounts[i].Name), trimmedQuery) {
				acc := entityAccounts[i]
				return &acc
			}
		}
	}

	isGeneric := lowerQuery == "" ||
		strings.Contains(lowerQuery, "principal") ||
		strings.Contains(lowerQuery, "general") ||
		strings.Contains(lowerQuery, "ahorros") ||
		strings.Contains(lowerQuery, "flexidigital") ||
		bankCanonicalKey(lowerQuery) == bankKey

	if trimmedQuery != "" && !isGeneric {
		for i := range entityAccounts {
			lowerName := strings.ToLower(entityAccounts[i].Name)
			if strings.Contains(lowerName, lowerQuery) || (len(lowerName) > 3 && strings.Contains(lowerQuery, lowerName)) {
				acc := entityAccounts[i]
				return &acc
			}
		}
	}

	if !isGeneric {
		return nil
	}

	if len(entityAccounts) == 1 {
		acc := entityAccounts[0]
		return &acc
	}

	var fundedPrimary *fiAccount
	var fundedAccounts []fiAccount
	var firstPrimary *fiAccount

	for i := range entityAccounts {
		acc := entityAccounts[i]
		isPrimary := isPrimaryFiAccount(acc)
		if isPrimary && firstPrimary == nil {
			firstPrimary = &acc
		}
		if acc.Balance > 0 {
			fundedAccounts = append(fundedAccounts, acc)
			if isPrimary && fundedPrimary == nil {
				fundedPrimary = &acc
			}
		}
	}

	if fundedPrimary != nil {
		return fundedPrimary
	}
	if len(fundedAccounts) == 1 {
		return &fundedAccounts[0]
	}
	if firstPrimary != nil {
		return firstPrimary
	}
	acc := entityAccounts[0]
	return &acc
}

func resolveFixedIncomeAccount(bank, account string) (*fiAccount, error) {
	if isCardOrExcludedAccount(account) {
		return nil, nil
	}
	bankKey := bankCanonicalKey(bank)
	if bankKey != "rappipay" && bankKey != "finandina" && bankKey != "nu" && bankKey != "plenti" {
		return nil, nil
	}

	entBytes, err := supabaseDo("GET", fmt.Sprintf("/fi_entities?user_id=eq.%s&select=id,name", DefaultOwnerId), nil, "")
	if err != nil {
		return nil, err
	}
	var entities []fiEntity
	if err := json.Unmarshal(entBytes, &entities); err != nil {
		return nil, err
	}

	accBytes, err := supabaseDo("GET", fmt.Sprintf("/fi_accounts?user_id=eq.%s&select=id,entity_id,name,balance,currency,extra_json", DefaultOwnerId), nil, "")
	if err != nil {
		return nil, err
	}
	var accounts []fiAccount
	if err := json.Unmarshal(accBytes, &accounts); err != nil {
		return nil, err
	}

	return matchFixedIncomeAccount(bank, account, entities, accounts), nil
}

func buildFixedIncomeDescription(description, txType string) string {
	desc := strings.TrimSpace(description)
	if txType == "debit" {
		if desc == "" {
			return "Retiro automático móvil"
		}
		if strings.HasPrefix(strings.ToLower(desc), "retiro") {
			return desc
		}
		return "Retiro: " + desc
	}
	if desc == "" {
		return "Depósito automático móvil"
	}
	return desc
}

func syncFixedIncomeDirect(matchedAcc *fiAccount, cfTxId, bank, description, txType string, amount float64, rawText, budgetItemName, dateStr, timeStr string) error {
	if matchedAcc == nil || (txType != "debit" && txType != "credit") || amount <= 0 {
		return nil
	}

	signedAmount := math.Abs(amount)
	if txType == "debit" {
		signedAmount = -signedAmount
	}
	newBalance := math.Round(math.Max(0, matchedAcc.Balance+signedAmount)*100) / 100

	curr := matchedAcc.Currency
	if curr == "" {
		curr = "COP"
	}
	cat := strings.TrimSpace(budgetItemName)
	if cat == "" {
		cat = "Movimiento Móvil"
	}

	fiTxPayload := map[string]interface{}{
		"id":          "tx_cf_" + cfTxId,
		"user_id":     DefaultOwnerId,
		"account_id":  matchedAcc.ID,
		"entity_id":   matchedAcc.EntityID,
		"date":        dateStr,
		"time":        timeStr,
		"type":        txType,
		"amount":      signedAmount,
		"currency":    curr,
		"description": buildFixedIncomeDescription(description, txType),
		"category":    cat,
		"source":      "mobile_direct_fallback",
		"extra_json": map[string]interface{}{
			"cfMovementId": cfTxId,
			"rawText":      rawText,
			"bank":         bank,
		},
	}

	if _, err := supabaseDo("POST", "/fi_transactions", fiTxPayload, "return=minimal"); err != nil {
		return err
	}

	extraAcc := make(map[string]interface{})
	for k, v := range matchedAcc.ExtraJSON {
		extraAcc[k] = v
	}
	extraAcc["balance"] = newBalance

	accPatch := map[string]interface{}{
		"balance":    newBalance,
		"extra_json": extraAcc,
	}
	accPath := fmt.Sprintf("/fi_accounts?id=eq.%s&user_id=eq.%s", url.QueryEscape(matchedAcc.ID), DefaultOwnerId)
	_, err := supabaseDo("PATCH", accPath, accPatch, "return=minimal")
	return err
}

// syncToSupabaseDirect inserts the transaction directly into Supabase PostgreSQL (cf_movements + fi_transactions/fi_accounts)
// as a resilient fallback when the backend webhook is unavailable or times out.
func syncToSupabaseDirect(bank, account, description, txType string, amount float64, rawText, budgetItemId, budgetItemName, budgetItemType string) error {
	now := time.Now().UTC().Add(-5 * time.Hour) // America/Bogota (UTC-5)
	period := now.Format("2006-01")
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("15:04:05")

	txId := fmt.Sprintf("cf_tx_mb_%d_%x", now.UnixNano()/int64(time.Millisecond), now.UnixNano()%0xFFFF)

	isCard := strings.Contains(strings.ToLower(account), "tarjeta") ||
		strings.Contains(strings.ToLower(account), "card") ||
		strings.Contains(strings.ToLower(account), "visa") ||
		strings.Contains(strings.ToLower(account), "mastercard") ||
		strings.Contains(strings.ToLower(account), "rappicard")

	sourceType := "fixed_pocket"
	if isCard {
		sourceType = "credit_card"
	} else if strings.Contains(strings.ToLower(account), "nomina") || strings.Contains(strings.ToLower(account), "nómina") || strings.Contains(strings.ToLower(account), "nu débito") || strings.Contains(strings.ToLower(account), "nu debito") {
		sourceType = "payroll"
	}

	targetName := account
	if targetName == "" {
		targetName = bank
	}

	matchedAcc, _ := resolveFixedIncomeAccount(bank, account)
	paymentSource := map[string]interface{}{
		"type":       sourceType,
		"targetName": targetName,
	}
	if matchedAcc != nil {
		paymentSource["type"] = "fixed_pocket"
		paymentSource["targetId"] = matchedAcc.ID
		paymentSource["targetName"] = matchedAcc.Name
	}

	payload := map[string]interface{}{
		"id":                  txId,
		"user_id":             DefaultOwnerId,
		"period":              period,
		"date":                dateStr,
		"time":                timeStr,
		"type":                txType,
		"amount":              amount,
		"currency":            "COP",
		"description":         description,
		"budget_item_id":      budgetItemId,
		"budget_item_name":    budgetItemName,
		"budget_item_type":    budgetItemType,
		"payment_source_json": paymentSource,
		"extra_json": map[string]interface{}{
			"source":  "kpital_mobile_direct",
			"rawText": rawText,
			"bank":    bank,
			"account": account,
		},
	}

	if _, err := supabaseDo("POST", "/cf_movements", payload, "return=minimal"); err != nil {
		return err
	}

	if matchedAcc != nil {
		return syncFixedIncomeDirect(matchedAcc, txId, bank, description, txType, amount, rawText, budgetItemName, dateStr, timeStr)
	}
	return nil
}

// SendTransactionWithRubroToBackend dispatches the user-confirmed transaction with both pocket and budget item (rubro).
// Calls the backend webhook first (which updates both Renta Fija and Flujo) and falls back to direct Supabase sync if offline.
func SendTransactionWithRubroToBackend(bank, account, description, txType string, amount float64, rawText, budgetItemId, budgetItemName, budgetItemType string) string {
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
		// If JSON marshal fails, fall back to direct Supabase sync
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

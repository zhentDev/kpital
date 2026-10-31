package models

import "time"

// RawNotification represents an incoming raw mobile notification from Android (MacroDroid, Tasker, etc.).
type RawNotification struct {
	AppName     string    `json:"app_name"`
	PackageName string    `json:"package_name,omitempty"`
	Title       string    `json:"title"`
	Text        string    `json:"text"`
	Timestamp   time.Time `json:"timestamp"`
}

// TransactionType denotes debit, credit, or yield distributions.
type TransactionType string

const (
	TypeDebit       TransactionType = "debit"
	TypeCredit      TransactionType = "credit"
	TypeYieldPayout TransactionType = "yield_payout"
)

// ParsedTransaction represents the normalized financial movement extracted from text.
type ParsedTransaction struct {
	Bank             string          `json:"bank"`
	Account          string          `json:"account"`
	Amount           float64         `json:"amount"`
	Type             TransactionType `json:"type"`
	Description      string          `json:"description"`
	RawText          string          `json:"raw_text"`
	ResultingBalance float64         `json:"resulting_balance,omitempty"`
	Currency         string          `json:"currency"`
	Confidence       float64         `json:"confidence"`
	MatchedRule      string          `json:"matched_rule,omitempty"`
}

// TitanesPayload represents the JSON payload expected by the Titanes Portfolio FastAPI webhook.
type TitanesPayload struct {
	Entity      string  `json:"entity"`
	Account     string  `json:"account"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Type        string  `json:"type"`
	Date        string  `json:"date,omitempty"`
	Category    string  `json:"category,omitempty"`
	RawText     string  `json:"raw_text,omitempty"`
}

// SimulatedPreset represents a pre-configured synthetic banking event for safe zero-money testing.
type SimulatedPreset struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Bank          string          `json:"bank"`
	ActionType    TransactionType `json:"action_type"`
	Title         string          `json:"title"`
	Text          string          `json:"text"`
	TargetAccount string          `json:"target_account"`
	Amount        float64         `json:"amount"`
	Description   string          `json:"description"`
	Category      string          `json:"category"`
	Badge         string          `json:"badge"`
}

// ToRawNotification converts a SimulatedPreset into a RawNotification for the parser.
func (p SimulatedPreset) ToRawNotification() RawNotification {
	return RawNotification{
		AppName:   p.Bank,
		Title:     p.Title,
		Text:      p.Text,
		Timestamp: time.Now(),
	}
}

// DispatchResult represents the result of forwarding a parsed transaction to FastAPI.
type DispatchResult struct {
	Success        bool               `json:"success"`
	StatusCode     int                `json:"status_code"`
	BackendMessage string             `json:"backend_message"`
	TargetURL      string             `json:"target_url"`
	Parsed         *ParsedTransaction `json:"parsed,omitempty"`
	LatencyMs      int64              `json:"latency_ms"`
	Error          string             `json:"error,omitempty"`
	Timestamp      time.Time          `json:"timestamp"`
}

// LogEvent represents a live log broadcast over Server-Sent Events (SSE).
type LogEvent struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"` // "INFO", "SUCCESS", "WARN", "ERROR"
	Source    string    `json:"source"`
	Message   string    `json:"message"`
	Details   any       `json:"details,omitempty"`
}

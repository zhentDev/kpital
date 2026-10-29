package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"titanes-portfolio/bank-simulator/pkg/models"
)

const (
	DefaultBaseURL   = "http://localhost:8000"
	DefaultSecretKey = "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"
)

// Client is a resilient HTTP client communicating with Titanes Portfolio FastAPI.
type Client struct {
	baseURL    string
	secretKey  string
	httpClient *http.Client
	maxRetries int
}

// NewClient creates a new configured Titanes Portfolio webhook client.
func NewClient(baseURL, secretKey string, timeout time.Duration) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = DefaultBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	if strings.TrimSpace(secretKey) == "" {
		secretKey = DefaultSecretKey
	}

	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	return &Client{
		baseURL:    baseURL,
		secretKey:  secretKey,
		httpClient: &http.Client{Timeout: timeout},
		maxRetries: 3,
	}
}

// BaseURL returns the configured base URL.
func (c *Client) BaseURL() string {
	return c.baseURL
}

// UpdateBaseURL allows dynamically toggling between Localhost and Cloud Render backend.
func (c *Client) UpdateBaseURL(newURL string) {
	if strings.TrimSpace(newURL) != "" {
		c.baseURL = strings.TrimRight(strings.TrimSpace(newURL), "/")
	}
}

// SendTransaction forwards a normalized transaction to FastAPI with retry logic.
func (c *Client) SendTransaction(ctx context.Context, tx *models.ParsedTransaction) (*models.DispatchResult, error) {
	targetURL := fmt.Sprintf("%s/api/webhooks/mobile-transaction", c.baseURL)

	payload := models.TitanesPayload{
		Entity:      tx.Bank,
		Account:     tx.Account,
		Amount:      tx.Amount,
		Description: tx.Description,
		Type:        string(tx.Type),
		Date:        time.Now().Format("2006-01-02"),
		RawText:     tx.RawText,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	var lastErr error
	var result models.DispatchResult
	result.TargetURL = targetURL
	result.Parsed = tx
	result.Timestamp = time.Now()

	backoff := 500 * time.Millisecond

	for attempt := 1; attempt <= c.maxRetries; attempt++ {
		start := time.Now()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewBuffer(jsonData))
		if err != nil {
			return nil, fmt.Errorf("failed to construct request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Secret", c.secretKey)
		req.Header.Set("User-Agent", "Titanes-Bank-Simulator/1.0 (Go)")

		resp, err := c.httpClient.Do(req)
		latency := time.Since(start).Milliseconds()
		result.LatencyMs = latency

		if err != nil {
			lastErr = err
			// Network error or timeout, retry if attempts remain
			if attempt < c.maxRetries {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(backoff):
					backoff *= 2
					continue
				}
			}
			break
		}

		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		result.StatusCode = resp.StatusCode

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			result.Success = true
			var backendResp map[string]any
			if jsonErr := json.Unmarshal(bodyBytes, &backendResp); jsonErr == nil {
				if msg, ok := backendResp["message"].(string); ok {
					result.BackendMessage = msg
				} else {
					result.BackendMessage = string(bodyBytes)
				}
			} else {
				result.BackendMessage = string(bodyBytes)
			}
			return &result, nil
		}

		// Handle 4xx client errors: no retry needed (auth failure, validation error)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			result.Success = false
			result.Error = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))
			result.BackendMessage = string(bodyBytes)
			return &result, nil
		}

		// Handle 5xx server errors: retry with backoff
		lastErr = fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(bodyBytes))
		if attempt < c.maxRetries {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
				backoff *= 2
				continue
			}
		}
	}

	result.Success = false
	if lastErr != nil {
		result.Error = lastErr.Error()
	} else {
		result.Error = "Unknown dispatch failure"
	}
	return &result, lastErr
}

// TriggerTelegramTest calls FastAPI /api/alerts/test-telegram to test the Telegram alert bot.
func (c *Client) TriggerTelegramTest(ctx context.Context) (map[string]any, error) {
	targetURL := fmt.Sprintf("%s/api/alerts/test-telegram", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Secret", c.secretKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

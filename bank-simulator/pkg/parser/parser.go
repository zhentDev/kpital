package parser

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"titanes-portfolio/bank-simulator/pkg/models"
)

var (
	ErrNoAmountFound = errors.New("no numeric amount found in notification")
	ErrUnrecognized  = errors.New("notification text does not match any known bank format")
)

// Common extraction regular expressions compiled once for zero-allocation performance.
var (
	amountRegex = regexp.MustCompile(`(?i)(?:\$|por|de|valor de|pagaste)\s*\$?\s*([\d\.,]+)`)
	genericAmt  = regexp.MustCompile(`\$?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]{2})?|[0-9]+(?:,[0-9]{2})?)`)
	balanceReg  = regexp.MustCompile(`(?i)(?:saldo|disponible|saldo nuevo|nuevo saldo)\s*(?:es|de)?:?\s*\$?\s*([\d\.,]+)`)

	// Nu Colombia
	nuSentRecipientRegex = regexp.MustCompile(`(?i)Le enviaste a\s+([^.]+?)(?:\s+en su cuenta|\s+con tu|\.|$|\.\.\.)`)
	nuPurchaseRegex      = regexp.MustCompile(`(?i)Compra (?:aprobada )?en\s+([^.]+?)(?:\s+por|\s+con|\.|$)`)
	nuReceivedRegex      = regexp.MustCompile(`(?i)Recibiste\s+.*?de\s+([^.]+?)(?:\s+en (?:su|tu) cuenta|\.|$)`)

	// RappiPay
	rappiViaRegex      = regexp.MustCompile(`(?i)a través de\s+([A-Za-z0-9\-\s]+?)(?:fue exitoso|\.|\.\.\.|$)`)
	rappiPurchaseRegex = regexp.MustCompile(`(?i)Compraste (?:por \$?[\d\.,]+ )?en\s+([^.]+?)(?:\s+con tu|\.|$)`)

	// Bancolombia / Caja Social / Davivienda
	bancoPurchaseRegex = regexp.MustCompile(`(?i)(?:compra por \$?[\d\.,]+ )?en\s+([A-Za-z0-9\s\.\*\-]+?)(?:\s+con tarjeta|\s+por|\.|$)`)
	transferFromRegex  = regexp.MustCompile(`(?i)desde cuenta (?:nequi |de )?de\s+([A-Za-z0-9\s]+?)(?:\.|\.\.\.|$)`)
)

// Engine is the central regex and bank parsing engine.
type Engine struct{}

// NewEngine initializes a thread-safe parser engine.
func NewEngine() *Engine {
	return &Engine{}
}

// Parse extracts a normalized ParsedTransaction from an incoming RawNotification.
func (e *Engine) Parse(n models.RawNotification) (*models.ParsedTransaction, error) {
	combined := strings.TrimSpace(n.Title + " " + n.Text)
	if combined == "" {
		return nil, ErrUnrecognized
	}

	bank := e.DetectBank(n)
	txType := e.DetectType(n)
	amount, err := e.ExtractAmount(n)
	if err != nil {
		return nil, err
	}

	description := e.ExtractDescription(n, bank, txType)
	account := e.DetectAccount(n, bank)
	resultingBal := e.ExtractBalance(n)

	parsed := &models.ParsedTransaction{
		Bank:             bank,
		Account:          account,
		Amount:           amount,
		Type:             txType,
		Description:      description,
		RawText:          combined,
		ResultingBalance: resultingBal,
		Currency:         "COP",
		Confidence:       0.95,
		MatchedRule:      fmt.Sprintf("%s:%s", bank, txType),
	}

	return parsed, nil
}

// DetectBank resolves the banking entity based on app, package, title, and body.
func (e *Engine) DetectBank(n models.RawNotification) string {
	combinedLower := strings.ToLower(n.AppName + " " + n.PackageName + " " + n.Title + " " + n.Text)

	switch {
	case strings.Contains(combinedLower, "rappicuenta") || strings.Contains(combinedLower, "rappipay") || strings.Contains(combinedLower, "rappi"):
		return "RappiPay"

	case strings.Contains(combinedLower, "nubank") || strings.Contains(combinedLower, "nu colombia") || strings.Contains(combinedLower, "tarjeta nu") || strings.Contains(combinedLower, "cuenta nu"):
		return "Nu Colombia"

	case strings.Contains(combinedLower, "bancolombia"):
		return "Bancolombia"

	case strings.Contains(combinedLower, "caja social") || strings.Contains(combinedLower, "banco caja social") || strings.Contains(combinedLower, "bcs"):
		return "Banco Caja Social"

	case strings.Contains(combinedLower, "finandina"):
		return "Finandina"

	case strings.Contains(combinedLower, "plenti"):
		return "Plenti (Ahorros)"

	case strings.Contains(combinedLower, "daviplata") || strings.Contains(combinedLower, "davivienda"):
		return "Davivienda / Daviplata"

	case strings.Contains(combinedLower, "google wallet") || strings.Contains(combinedLower, "billetera de google") || strings.Contains(combinedLower, "google pay"):
		// Check if card brand / entity is embedded
		if strings.Contains(combinedLower, "nu") {
			return "Nu Colombia"
		}
		if strings.Contains(combinedLower, "rappi") {
			return "RappiPay"
		}
		return "Google Wallet"

	case strings.Contains(combinedLower, "nequi"):
		return "Nequi Colombia"

	default:
		if n.AppName != "" {
			return n.AppName
		}
		return "Entidad Bancaria"
	}
}

// DetectType determines if the event is a debit, credit, or yield payout.
func (e *Engine) DetectType(n models.RawNotification) models.TransactionType {
	combinedLower := strings.ToLower(n.Title + " " + n.Text)

	// Yield payout keywords
	if strings.Contains(combinedLower, "rendimiento") || strings.Contains(combinedLower, "rendimientos") || strings.Contains(combinedLower, "intereses generados") {
		return models.TypeYieldPayout
	}

	// Credit / Inflow keywords
	creditWords := []string{
		"recibiste", "te transfirieron", "abono", "consignacion",
		"consignación", "nomina", "nómina", "devolucion", "devolución",
		"pago recibido", "aporte exitoso", "pasaplata recibido",
	}
	for _, word := range creditWords {
		if strings.Contains(combinedLower, word) {
			return models.TypeCredit
		}
	}

	// Default is debit (expenses, transfers out, card purchases)
	return models.TypeDebit
}

// ExtractAmount parses the monetary amount, prioritizing Title if present (as in Nu).
func (e *Engine) ExtractAmount(n models.RawNotification) (float64, error) {
	// 1. Try Title first (Nu Colombia puts "Enviaste $33.500,00" in Title)
	if n.Title != "" {
		if m := genericAmt.FindStringSubmatch(n.Title); len(m) > 1 {
			if amt, err := ParseCOPAmount(m[1]); err == nil && amt > 0 {
				return amt, nil
			}
		}
	}

	// 2. Try contextual regex on Text
	if m := amountRegex.FindStringSubmatch(n.Text); len(m) > 1 {
		if amt, err := ParseCOPAmount(m[1]); err == nil && amt > 0 {
			return amt, nil
		}
	}

	// 3. Try generic amount pattern on Text
	if m := genericAmt.FindStringSubmatch(n.Text); len(m) > 1 {
		if amt, err := ParseCOPAmount(m[1]); err == nil && amt > 0 {
			return amt, nil
		}
	}

	return 0, ErrNoAmountFound
}

// ExtractDescription retrieves the merchant, recipient, or action description cleanly.
func (e *Engine) ExtractDescription(n models.RawNotification, bank string, txType models.TransactionType) string {
	text := n.Text
	title := n.Title

	// Google Wallet puts the merchant name directly in Title
	if (strings.Contains(strings.ToLower(n.AppName), "billetera") || strings.Contains(strings.ToLower(n.AppName), "google")) &&
		title != "" && !strings.EqualFold(title, "Billetera de Google") && !strings.EqualFold(title, "Google Wallet") {
		return strings.TrimSpace(title)
	}

	switch bank {
	case "Nu Colombia":
		if m := nuSentRecipientRegex.FindStringSubmatch(text); len(m) > 1 {
			return strings.TrimSpace(m[1])
		}
		if m := nuPurchaseRegex.FindStringSubmatch(text); len(m) > 1 {
			return "Compra " + strings.TrimSpace(m[1])
		}
		if m := nuReceivedRegex.FindStringSubmatch(text); len(m) > 1 {
			return "Transferencia de " + strings.TrimSpace(m[1])
		}

	case "RappiPay":
		if m := rappiViaRegex.FindStringSubmatch(text); len(m) > 1 {
			return "Envío " + strings.TrimSpace(m[1])
		}
		if m := rappiPurchaseRegex.FindStringSubmatch(text); len(m) > 1 {
			return "Compra " + strings.TrimSpace(m[1])
		}
		if strings.Contains(strings.ToLower(text), "rendimientos") {
			return "Abono Rendimientos RappiCuenta"
		}

	case "Plenti (Ahorros)":
		if strings.Contains(strings.ToLower(text), "rendimiento") {
			return "Rendimiento Diario Plenti"
		}
		return "Movimiento Plenti"

	case "Nequi Colombia":
		if strings.Contains(strings.ToLower(text), "pagaste") {
			re := regexp.MustCompile(`(?i)pagaste\s+\$?[\d\.,]+\s+en\s+([^.]+?)(?:\s+con|\.|$)`)
			if m := re.FindStringSubmatch(text); len(m) > 1 {
				return "Compra " + strings.TrimSpace(m[1])
			}
		}
		if strings.Contains(strings.ToLower(text), "transfirieron") || strings.Contains(strings.ToLower(text), "recibiste") {
			return "Transferencia recibida Nequi"
		}
		return "Movimiento Nequi"

	case "Davivienda / Daviplata":
		if strings.Contains(strings.ToLower(text), "pagaste") {
			re := regexp.MustCompile(`(?i)pagaste\s+\$?[\d\.,]+\s+en\s+([^.]+?)(?:\s+con|\.|$)`)
			if m := re.FindStringSubmatch(text); len(m) > 1 {
				return "Compra " + strings.TrimSpace(m[1])
			}
		}
		if strings.Contains(strings.ToLower(text), "recibiste") || strings.Contains(strings.ToLower(text), "pasaron") {
			return "Transferencia recibida Daviplata"
		}
		return "Movimiento Daviplata"
	}

	// Generic purchase / merchant matching
	if m := bancoPurchaseRegex.FindStringSubmatch(text); len(m) > 1 {
		return "Compra " + strings.TrimSpace(m[1])
	}
	if m := transferFromRegex.FindStringSubmatch(text); len(m) > 1 {
		return "Transferencia de " + strings.TrimSpace(m[1])
	}

	// Fallback to title if descriptive, or general action
	if title != "" && !strings.EqualFold(title, bank) && !strings.HasPrefix(strings.ToLower(title), "enviaste") {
		return strings.TrimSpace(title)
	}

	if txType == models.TypeCredit {
		return "Abono bancario"
	}
	if txType == models.TypeYieldPayout {
		return "Rendimientos de cuenta"
	}
	return "Gasto con tarjeta / Transferencia"
}

// DetectAccount checks if a specific pocket/cajita is explicitly named.
func (e *Engine) DetectAccount(n models.RawNotification, bank string) string {
	combinedLower := strings.ToLower(n.Title + " " + n.Text)

	// Check specific Nu pockets
	if strings.Contains(combinedLower, "cajita viaje") || strings.Contains(combinedLower, "viaje") {
		return "Cajita Viaje"
	}
	if strings.Contains(combinedLower, "cajita estudios") || strings.Contains(combinedLower, "estudios") {
		return "Cajita Estudios"
	}
	if strings.Contains(combinedLower, "deuda mom") {
		return "Cajita Deuda mom"
	}

	// Check Rappi pockets
	if strings.Contains(combinedLower, "impresora") {
		return "Impresora"
	}
	if strings.Contains(combinedLower, "fondo de emergencia") || strings.Contains(combinedLower, "emergencia") {
		return "Fondo de emergencia"
	}

	// Check Plenti pockets
	if strings.Contains(combinedLower, "bolsillo a la vista") || strings.Contains(combinedLower, "bolsillo") {
		return "Bolsillo a la vista"
	}

	// Check Finandina
	if strings.Contains(combinedLower, "flexi") {
		return "Flexi Digital +"
	}

	// Default accounts based on bank
	switch bank {
	case "Nu Colombia":
		return "Cuenta Nu Débito (Nómina)"
	case "RappiPay":
		return "Cuenta Rappi (Principal)"
	case "Finandina":
		return "Cuenta Finandina (Principal)"
	case "Nequi Colombia":
		return "Disponible Nequi"
	case "Davivienda / Daviplata":
		return "Daviplata Principal"
	default:
		return "Cuenta Nómina / Principal"
	}
}

// ExtractBalance extracts the resulting account balance if present in the text.
func (e *Engine) ExtractBalance(n models.RawNotification) float64 {
	if m := balanceReg.FindStringSubmatch(n.Text); len(m) > 1 {
		if val, err := ParseCOPAmount(m[1]); err == nil {
			return val
		}
	}
	return 0
}

// ToTitanesPayload converts the parsed transaction into the exact JSON model expected by FastAPI.
func (e *Engine) ToTitanesPayload(p *models.ParsedTransaction) models.TitanesPayload {
	return models.TitanesPayload{
		Entity:      p.Bank,
		Account:     p.Account,
		Amount:      p.Amount,
		Description: p.Description,
		Type:        string(p.Type),
		Date:        time.Now().Format("2006-01-02"),
		Category:    "Automated Simulator / Webhook",
		RawText:     p.RawText,
	}
}

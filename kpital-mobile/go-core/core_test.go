package core

import (
	"encoding/json"
	"testing"
	"time"
)

func TestProcessNotification(t *testing.T) {
	InitConfig("http://mock-api.local", "secret123", "", false)

	t.Run("Nu Colombia Supermarket Card Purchase", func(t *testing.T) {
		res := ProcessNotification(
			"com.nu.colombia",
			"Nubank",
			"Compra aprobada en EXITO CALLE 170 por $45.000 con tu tarjeta Nu",
			time.Now().UnixMilli(),
		)

		if !res.Parsed {
			t.Fatalf("Expected notification to be parsed, got error: %s", res.ErrorMessage)
		}

		if res.Amount != 45000 {
			t.Errorf("Expected amount 45000, got %f", res.Amount)
		}

		if res.Bank != "Nu Colombia" {
			t.Errorf("Expected bank Nu Colombia, got %s", res.Bank)
		}

		if res.TxType != "debit" {
			t.Errorf("Expected debit txType, got %s", res.TxType)
		}
	})

	t.Run("Nu Colombia Transfer Received", func(t *testing.T) {
		res := ProcessNotification(
			"com.nu.colombia",
			"Nubank",
			"Recibiste $150.000,00 de CARLOS PEREZ en tu cuenta Nu.",
			time.Now().UnixMilli(),
		)

		if !res.Parsed {
			t.Fatalf("Expected notification to be parsed, got error: %s", res.ErrorMessage)
		}

		if res.Amount != 150000 {
			t.Errorf("Expected amount 150000, got %f", res.Amount)
		}

		if res.TxType != "credit" {
			t.Errorf("Expected credit txType, got %s", res.TxType)
		}
	})

	t.Run("JSON bridge output", func(t *testing.T) {
		jsonStr := ProcessNotificationJSON(
			"com.rpay.rappi",
			"RappiPay",
			"Compraste por $25.000 en DROGUERIA CRUZ VERDE con tu tarjeta RappiCard",
			time.Now().UnixMilli(),
		)

		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
			t.Fatalf("Failed to parse output JSON: %v", err)
		}

		if parsed["parsed"] != true {
			t.Errorf("Expected parsed=true in JSON, got %v", parsed)
		}
		if parsed["amount"].(float64) != 25000 {
			t.Errorf("Expected amount 25000, got %v", parsed["amount"])
		}
	})
}

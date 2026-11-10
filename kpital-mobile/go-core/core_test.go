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

func TestMatchFixedIncomeAccountFallback(t *testing.T) {
	entities := []fiEntity{
		{ID: "ent_rappipay", Name: "RappiPay"},
		{ID: "ent_finandina", Name: "Banco Finandina"},
		{ID: "ent_nu", Name: "Nu Colombia"},
	}
	accounts := []fiAccount{
		{ID: "acc_1789616855068", EntityID: "ent_rappipay", Name: "Impresora", Balance: 296483.88, Currency: "COP"},
		{ID: "acc_1789760692910", EntityID: "ent_rappipay", Name: "Fondo de emergencia", Balance: 228400.16, Currency: "COP"},
		{ID: "acc_finandina_principal", EntityID: "ent_finandina", Name: "Cuenta Finandina (Principal)", Balance: 0, Currency: "COP"},
		{ID: "acc_1786771927434", EntityID: "ent_finandina", Name: "Bolsillo de Ahorro — Fondo de Emergencia (FlexiDigital +)", Balance: 485945.92, Currency: "COP"},
		{ID: "acc_nu_debito", EntityID: "ent_nu", Name: "Cuenta Nu Débito", Balance: 100000, Currency: "COP"},
		{ID: "acc_nu_cajita", EntityID: "ent_nu", Name: "Cajita Nu", Balance: 50000, Currency: "COP"},
	}

	if got := matchFixedIncomeAccount("RappiPay", "Impresora", entities, accounts); got == nil || got.ID != "acc_1789616855068" {
		t.Fatalf("Expected Impresora account, got %+v", got)
	}
	if got := matchFixedIncomeAccount("Rappi", "Fondo de emergencia", entities, accounts); got == nil || got.ID != "acc_1789760692910" {
		t.Fatalf("Expected Fondo de emergencia account, got %+v", got)
	}
	if got := matchFixedIncomeAccount("Banco Finandina", "Cuenta Finandina", entities, accounts); got == nil || got.ID != "acc_1786771927434" {
		t.Fatalf("Expected funded Finandina FlexiDigital+ pocket, got %+v", got)
	}
	if got := matchFixedIncomeAccount("Nu Colombia", "Cuenta Nu Débito", entities, accounts); got != nil {
		t.Fatalf("Expected Nu Debito to be skipped, got %+v", got)
	}
	if got := matchFixedIncomeAccount("Nu Colombia", "Tarjeta Nu", entities, accounts); got != nil {
		t.Fatalf("Expected credit card to be skipped, got %+v", got)
	}
	if got := matchFixedIncomeAccount("Nu Colombia", "Cajita Nu", entities, accounts); got == nil || got.ID != "acc_nu_cajita" {
		t.Fatalf("Expected Cajita Nu account, got %+v", got)
	}
}

func TestBuildFixedIncomeDescription(t *testing.T) {
	if got := buildFixedIncomeDescription("Préstamo Tatiana", "debit"); got != "Retiro: Préstamo Tatiana" {
		t.Fatalf("Unexpected debit description: %s", got)
	}
	if got := buildFixedIncomeDescription("Retiro Bre-B", "debit"); got != "Retiro Bre-B" {
		t.Fatalf("Unexpected already-prefixed description: %s", got)
	}
	if got := buildFixedIncomeDescription("Pago cliente", "credit"); got != "Pago cliente" {
		t.Fatalf("Unexpected credit description: %s", got)
	}
}

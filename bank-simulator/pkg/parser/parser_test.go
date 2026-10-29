package parser

import (
	"testing"
	"time"

	"titanes-portfolio/bank-simulator/pkg/models"
)

func TestParseAmount(t *testing.T) {
	testCases := []struct {
		input    string
		expected float64
	}{
		{"$33.500,00", 33500.0},
		{"$ 9.400,00", 9400.0},
		{"$45.000", 45000.0},
		{"1.250.000,50", 1250000.50},
		{"35000", 35000.0},
		{"$ 28,500", 28500.0},
		{"$ 3.662.854", 3662854.0},
		{"$450", 450.0},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			got, err := ParseCOPAmount(tc.input)
			if err != nil {
				t.Fatalf("unexpected error for %q: %v", tc.input, err)
			}
			if got != tc.expected {
				t.Errorf("for input %q: expected %f, got %f", tc.input, tc.expected, got)
			}
		})
	}
}

func TestParserEngineRealWorldCases(t *testing.T) {
	engine := NewEngine()

	testCases := []struct {
		name             string
		notification     models.RawNotification
		expectedBank     string
		expectedType     models.TransactionType
		expectedAmount   float64
		expectedAccount  string
		expectedDesc     string
		expectedBalMin   float64
	}{
		{
			name: "Nu Colombia - Transfer sent (Amount in Title)",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Enviaste $33.500,00",
				Text:    "Le enviaste a ERL****** NAV****** en su cuenta de Nequi.",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeDebit,
			expectedAmount:  33500.0,
			expectedAccount: "Cuenta Nu Débito (Nómina)",
			expectedDesc:    "ERL****** NAV******",
		},
		{
			name: "Nu Colombia - Supermarket card purchase",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Nubank",
				Text:    "Compra aprobada en EXITO CALLE 170 por $45.000 con tu tarjeta Nu",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeDebit,
			expectedAmount:  45000.0,
			expectedAccount: "Cuenta Nu Débito (Nómina)",
			expectedDesc:    "Compra EXITO CALLE 170",
		},
		{
			name: "Nu Colombia - Incoming transfer received",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Nubank",
				Text:    "Recibiste $150.000,00 de CARLOS PEREZ en tu cuenta Nu.",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeCredit,
			expectedAmount:  150000.0,
			expectedAccount: "Cuenta Nu Débito (Nómina)",
			expectedDesc:    "Transferencia de CARLOS PEREZ",
		},
		{
			name: "Nu Colombia - Pocket expense (Cajita Viaje)",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Cajita Viaje",
				Text:    "Retiraste $70.000 de tu Cajita Viaje para gastos.",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeDebit,
			expectedAmount:  70000.0,
			expectedAccount: "Cajita Viaje",
			expectedDesc:    "Cajita Viaje",
		},
		{
			name: "RappiPay - Real Bre-B transfer",
			notification: models.RawNotification{
				AppName: "Rappi",
				Title:   "RappiCuenta",
				Text:    "El envío por $9.400,00 a través de Bre-B fue exitoso. Revisa en tus movimientos el detalle",
			},
			expectedBank:    "RappiPay",
			expectedType:    models.TypeDebit,
			expectedAmount:  9400.0,
			expectedAccount: "Cuenta Rappi (Principal)",
			expectedDesc:    "Envío Bre-B",
		},
		{
			name: "RappiPay - Pharmacy card purchase",
			notification: models.RawNotification{
				AppName: "Rappi",
				Title:   "RappiCuenta",
				Text:    "Compraste por $28.500 en FARMACIA PASTEUR con tu tarjeta RappiPay",
			},
			expectedBank:    "RappiPay",
			expectedType:    models.TypeDebit,
			expectedAmount:  28500.0,
			expectedAccount: "Cuenta Rappi (Principal)",
			expectedDesc:    "Compra FARMACIA PASTEUR",
		},
		{
			name: "RappiPay - Yield payout credited to emergency fund with balance",
			notification: models.RawNotification{
				AppName: "Rappi",
				Title:   "RappiCuenta",
				Text:    "Tu abono de rendimientos por $3.210 ha sido acreditado en Fondo de emergencia. Saldo: $1.073.210",
			},
			expectedBank:    "RappiPay",
			expectedType:    models.TypeYieldPayout,
			expectedAmount:  3210.0,
			expectedAccount: "Fondo de emergencia",
			expectedDesc:    "Abono Rendimientos RappiCuenta",
			expectedBalMin:  1073210.0,
		},
		{
			name: "Bancolombia - Card purchase",
			notification: models.RawNotification{
				AppName: "Bancolombia",
				Title:   "Bancolombia",
				Text:    "Bancolombia le informa compra por $65.000 en ALMACEN EXITO con tarjeta debito *1234",
			},
			expectedBank:   "Bancolombia",
			expectedType:   models.TypeDebit,
			expectedAmount: 65000.0,
			expectedDesc:   "Compra ALMACEN EXITO",
		},
		{
			name: "Banco Caja Social - Cash ATM withdrawal",
			notification: models.RawNotification{
				AppName: "Banco Caja Social",
				Title:   "Banco Caja Social",
				Text:    "Banco Caja Social le informa retiro por $100.000 en Cajero Unicentro",
			},
			expectedBank:   "Banco Caja Social",
			expectedType:   models.TypeDebit,
			expectedAmount: 100000.0,
		},
		{
			name: "Plenti - Daily yield in pocket",
			notification: models.RawNotification{
				AppName: "Plenti",
				Title:   "Plenti",
				Text:    "Tu rendimiento diario de $450 ya está disponible en tu Bolsillo a la vista",
			},
			expectedBank:    "Plenti (Ahorros)",
			expectedType:    models.TypeYieldPayout,
			expectedAmount:  450.0,
			expectedAccount: "Bolsillo a la vista",
			expectedDesc:    "Rendimiento Diario Plenti",
		},
		{
			name: "Google Wallet - Contactless payment with Nu card",
			notification: models.RawNotification{
				AppName: "Billetera de Google",
				Title:   "STARBUCKS",
				Text:    "Pagaste $22.500 con tu tarjeta Nu en STARBUCKS",
			},
			expectedBank:   "Nu Colombia",
			expectedType:   models.TypeDebit,
			expectedAmount: 22500.0,
			expectedDesc:   "STARBUCKS",
		},
		{
			name: "Nu Colombia - Full payroll net salary receipt",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Nu Colombia",
				Text:    "Consignación de nómina recibida por $3.662.854 en tu Cuenta Nu Débito",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeCredit,
			expectedAmount:  3662854.0,
			expectedAccount: "Cuenta Nu Débito (Nómina)",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.notification.Timestamp = time.Now()
			parsed, err := engine.Parse(tc.notification)
			if err != nil {
				t.Fatalf("unexpected error parsing notification: %v", err)
			}

			if parsed.Bank != tc.expectedBank {
				t.Errorf("Bank mismatch: expected %q, got %q", tc.expectedBank, parsed.Bank)
			}
			if parsed.Type != tc.expectedType {
				t.Errorf("Type mismatch: expected %q, got %q", tc.expectedType, parsed.Type)
			}
			if parsed.Amount != tc.expectedAmount {
				t.Errorf("Amount mismatch: expected %f, got %f", tc.expectedAmount, parsed.Amount)
			}
			if tc.expectedAccount != "" && parsed.Account != tc.expectedAccount {
				t.Errorf("Account mismatch: expected %q, got %q", tc.expectedAccount, parsed.Account)
			}
			if tc.expectedDesc != "" && parsed.Description != tc.expectedDesc {
				t.Errorf("Description mismatch: expected %q, got %q", tc.expectedDesc, parsed.Description)
			}
			if tc.expectedBalMin > 0 && parsed.ResultingBalance != tc.expectedBalMin {
				t.Errorf("Balance mismatch: expected %f, got %f", tc.expectedBalMin, parsed.ResultingBalance)
			}

			// Validate conversion to TitanesPayload
			payload := engine.ToTitanesPayload(parsed)
			if payload.Amount != tc.expectedAmount || payload.Entity != tc.expectedBank {
				t.Errorf("Titanes payload mismatch: %+v", payload)
			}
		})
	}
}

package parser

import (
	"testing"
	"time"

	"kpital.mobile/core/models"
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
			name: "Banco Caja Social - SMS approved payment",
			notification: models.RawNotification{
				AppName:     "Mensajes",
				PackageName: "com.google.android.apps.messaging",
				Title:       "87227",
				Text:        "Su pago por $43.427,99 para CREDITOS DE CONSUMO quedo Aprobado. 11/03/2026 23:46. Banco Caja Social Tel Bta 601 542 6446 ? Nal 018000910038.",
			},
			expectedBank:    "Banco Caja Social",
			expectedType:    models.TypeDebit,
			expectedAmount:  43427.99,
			expectedAccount: "Cuenta Nómina / Principal",
			expectedDesc:    "Pago CREDITOS DE CONSUMO",
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
			name: "Nu Colombia - Refund without trailing por",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Devolución exitosa",
				Text:    "Recibiste una devolución de DL GOOGLE PLAY YOUTUBE por $2.000,00 que puedes ver desde tu app.",
			},
			expectedBank:    "Nu Colombia",
			expectedType:    models.TypeCredit,
			expectedAmount:  2000.0,
			expectedAccount: "Cuenta Nu Débito (Nómina)",
			expectedDesc:    "Devolución DL GOOGLE PLAY YOUTUBE",
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


func TestInformationalBalanceAndFilteringCases(t *testing.T) {
	engine := NewEngine()

	// 1. Informational Daily Balance notifications (Must NOT generate expense/debit)
	balanceCases := []struct {
		name            string
		notification    models.RawNotification
		expectedBank    string
		expectedBalance float64
	}{
		{
			name: "Banco Caja Social - Daily account balance push",
			notification: models.RawNotification{
				AppName: "Banco Caja Social",
				Title:   "Banco Caja Social",
				Text:    "Tu saldo en cuenta de ahorros No. ****1234 es de $1.250.000",
			},
			expectedBank:    "Banco Caja Social",
			expectedBalance: 1250000.0,
		},
		{
			name: "Banco Caja Social - BCS Informa saldo disponible",
			notification: models.RawNotification{
				AppName: "Banco Caja Social",
				Title:   "BCS Informa",
				Text:    "Tu saldo disponible es $850.000",
			},
			expectedBank:    "Banco Caja Social",
			expectedBalance: 850000.0,
		},
		{
			name: "Banco Caja Social - Saldo a la fecha",
			notification: models.RawNotification{
				AppName: "Banco Caja Social",
				Title:   "BCS",
				Text:    "Saldo disponible al 05/11/2026 es $450.000 COP",
			},
			expectedBank:    "Banco Caja Social",
			expectedBalance: 450000.0,
		},
		{
			name: "Bancolombia - Informative balance notification",
			notification: models.RawNotification{
				AppName: "Bancolombia",
				Title:   "Bancolombia",
				Text:    "Bancolombia le informa que su saldo disponible en la cuenta *1234 es $1.500.000",
			},
			expectedBank:    "Bancolombia",
			expectedBalance: 1500000.0,
		},
		{
			name: "Daviplata - Consulta de saldo informativa",
			notification: models.RawNotification{
				AppName: "Daviplata",
				Title:   "Daviplata",
				Text:    "Daviplata informa: Tu saldo disponible es de $350.000",
			},
			expectedBank:    "Davivienda / Daviplata",
			expectedBalance: 350000.0,
		},
		{
			name: "Banco Caja Social - SMS daily closing balance via 87227",
			notification: models.RawNotification{
				AppName:     "CLARO DIGITAL",
				PackageName: "com.google.android.apps.messaging",
				Title:       "87227",
				Text:        "Al final del 20261105 el saldo de su cuenta de ahorros No. ****1234 es $1.500.000 COP.",
			},
			expectedBank:    "Banco Caja Social",
			expectedBalance: 1500000.0,
		},
		{
			name: "Banco Caja Social - SMS daily closing balance with percent symbol and without del",
			notification: models.RawNotification{
				AppName:     "CLARO DIGITAL",
				PackageName: "com.google.android.apps.messaging",
				Title:       "87227",
				Text:        "Al final de 20261108 el saldo de su cuenta **3417 fue de % 10,839.48. Banco Caja Social.",
			},
			expectedBank:    "Banco Caja Social",
			expectedBalance: 10839.48,
		},
	}

	for _, bc := range balanceCases {
		t.Run(bc.name, func(t *testing.T) {
			parsed, err := engine.Parse(bc.notification)
			if err != nil {
				t.Fatalf("unexpected error parsing balance notification: %v", err)
			}
			if !parsed.IsInformational {
				t.Errorf("expected IsInformational to be true for %s", bc.name)
			}
			if parsed.Type != models.TypeBalanceDigest {
				t.Errorf("expected Type to be TypeBalanceDigest, got %q", parsed.Type)
			}
			if parsed.Amount != 0.0 {
				t.Errorf("expected Amount to be 0.0 (NO expense), got %f", parsed.Amount)
			}
			if parsed.ResultingBalance != bc.expectedBalance {
				t.Errorf("expected ResultingBalance %f, got %f", bc.expectedBalance, parsed.ResultingBalance)
			}
			if parsed.Bank != bc.expectedBank {
				t.Errorf("expected Bank %q, got %q", bc.expectedBank, parsed.Bank)
			}
		})
	}

	// 2. Security, OTP, and Marketing notifications (Must be ignored/filtered with ErrIgnoredNotification)
	filteredCases := []struct {
		name         string
		notification models.RawNotification
	}{
		{
			name: "Bancolombia - Clave dinámica OTP",
			notification: models.RawNotification{
				AppName: "Bancolombia",
				Title:   "Clave Dinámica",
				Text:    "Tu clave dinámica es 849201. Válida por 5 minutos. No la compartas con nadie.",
			},
		},
		{
			name: "Banco Caja Social - Token digital",
			notification: models.RawNotification{
				AppName: "Banco Caja Social",
				Title:   "Seguridad BCS",
				Text:    "Token de seguridad: 349102 para inicio de sesión en tu portal.",
			},
		},
		{
			name: "Bancolombia - Crédito preaprobado comercial",
			notification: models.RawNotification{
				AppName: "Bancolombia",
				Title:   "Bancolombia",
				Text:    "Tienes un crédito preaprobado por $15.000.000. Solicítalo en tu App.",
			},
		},
		{
			name: "Nu Colombia - Cupo disponible en tarjeta de crédito",
			notification: models.RawNotification{
				AppName: "Nubank",
				Title:   "Nu",
				Text:    "Tu tarjeta de crédito tiene un cupo disponible de $3.000.000",
			},
		},
		{
			name: "Banco Falabella - Transacción rechazada",
			notification: models.RawNotification{
				AppName: "Banco Falabella",
				Title:   "Transacción Declinada",
				Text:    "Compra por $120.000 fue rechazada por fondos insuficientes.",
			},
		},
		{
			name: "Rappi - Marketing promo discount $13500 OFF",
			notification: models.RawNotification{
				AppName:     "Rappi",
				PackageName: "com.grability.rappi",
				Title:       "Consiente al peludo: $13500 OFF 🐱",
				Text:        "Válido también en súper o farmacia. Pide en Rappi y te llega de una. Aplican T&C",
			},
		},
		{
			name: "Rappi - Marketing discount 40% OFF skincare",
			notification: models.RawNotification{
				AppName:     "Rappi",
				PackageName: "com.grability.rappi",
				Title:       "💖 Skincare coreano hasta 40%!",
				Text:        "Dale a tu piel el cuidado que merece. En Línea Estética todo para tu piel con hasta 40% OFF. Aplican T&C",
			},
		},
		{
			name: "Nequi - Marketing concert ticket presale Maluma with compra tus bolestas",
			notification: models.RawNotification{
				AppName:     "Nequi",
				PackageName: "com.nequi.nequi",
				Title:       "\"Maluma está loco x volver\"",
				Text:        "La preventa exclusiva arranca HOY 9 de noviembre con tu Tarjeta Nequi Visa, compra tus bolestas. Hazlo aquí.",
			},
		},
	}

	for _, fc := range filteredCases {
		t.Run(fc.name, func(t *testing.T) {
			_, err := engine.Parse(fc.notification)
			if err == nil {
				t.Errorf("expected ErrIgnoredNotification for %s, but got nil", fc.name)
			}
		})
	}
}

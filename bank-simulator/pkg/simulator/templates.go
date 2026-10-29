package simulator

import (
	"fmt"
	"strings"

	"titanes-portfolio/bank-simulator/pkg/models"
)

// GetDefaultPresets returns the catalog of realistic synthetic banking notifications
// representing real Colombian bank formats for zero-risk testing.
func GetDefaultPresets() []models.SimulatedPreset {
	return []models.SimulatedPreset{
		// === NU COLOMBIA ===
		{
			ID:            "nu-salary",
			Name:          "Nu: Consignación de Nómina ($3.662.854)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeCredit,
			Title:         "Nu Colombia",
			Text:          "Consignación de nómina recibida por $3.662.854 en tu Cuenta Nu Débito",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        3662854,
			Description:   "Consignación Nómina",
			Category:      "Nómina",
		},
		{
			ID:            "nu-exito-card",
			Name:          "Nu: Compra Éxito Débito ($45.000)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeDebit,
			Title:         "Nubank",
			Text:          "Compra aprobada en EXITO CALLE 170 por $45.000 con tu tarjeta Nu",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        45000,
			Description:   "Compra EXITO CALLE 170",
			Category:      "Mercado",
		},
		{
			ID:            "nu-transfer-sent",
			Name:          "Nu: Envío Nequi / Transfiya ($33.500)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeDebit,
			Title:         "Enviaste $33.500,00",
			Text:          "Le enviaste a ERL****** NAV****** en su cuenta de Nequi.",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        33500,
			Description:   "ERL****** NAV******",
			Category:      "Transferencias",
		},
		{
			ID:            "nu-transfer-received",
			Name:          "Nu: Transferencia Recibida ($150.000)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeCredit,
			Title:         "Nubank",
			Text:          "Recibiste $150.000,00 de CARLOS PEREZ en tu cuenta Nu.",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        150000,
			Description:   "Transferencia de CARLOS PEREZ",
			Category:      "Ingresos Varios",
		},
		{
			ID:            "nu-cajita-viaje",
			Name:          "Nu: Gasto Cajita Viaje ($70.000)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeDebit,
			Title:         "Cajita Viaje",
			Text:          "Retiraste $70.000 de tu Cajita Viaje para gastos.",
			TargetAccount: "Cajita Viaje",
			Amount:        70000,
			Description:   "Gasto Cajita Viaje",
			Category:      "Viajes",
		},
		{
			ID:            "nu-yield-cajitas",
			Name:          "Nu: Abono Intereses Cajitas ($5.420)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeYieldPayout,
			Title:         "Nubank",
			Text:          "Tus rendimientos diarios de $5.420 se han acreditado en tus Cajitas Nu.",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        5420,
			Description:   "Rendimientos Cajitas Nu",
			Category:      "Rendimientos",
		},

		// === RAPPIPAY ===
		{
			ID:            "rappi-bre-b",
			Name:          "RappiPay: Envío Bre-B Interbancario ($9.400)",
			Bank:          "RappiPay",
			ActionType:    models.TypeDebit,
			Title:         "RappiCuenta",
			Text:          "El envío por $9.400,00 a través de Bre-B fue exitoso. Revisa en tus movimientos el detalle",
			TargetAccount: "Cuenta Rappi (Principal)",
			Amount:        9400,
			Description:   "Envío Bre-B",
			Category:      "Transferencias",
		},
		{
			ID:            "rappi-farmacia",
			Name:          "RappiPay: Compra Farmacia Pasteur ($28.500)",
			Bank:          "RappiPay",
			ActionType:    models.TypeDebit,
			Title:         "RappiCuenta",
			Text:          "Compraste por $28.500 en FARMACIA PASTEUR con tu tarjeta RappiPay",
			TargetAccount: "Cuenta Rappi (Principal)",
			Amount:        28500,
			Description:   "Compra FARMACIA PASTEUR",
			Category:      "Salud",
		},
		{
			ID:            "rappi-impresora",
			Name:          "RappiPay: Retiro Cajita Impresora ($10.000)",
			Bank:          "RappiPay",
			ActionType:    models.TypeDebit,
			Title:         "RappiCuenta",
			Text:          "Retiro de $10.000 de tu bolsillo Impresora para consumibles.",
			TargetAccount: "Impresora",
			Amount:        10000,
			Description:   "Retiro bolsillo Impresora",
			Category:      "Oficina",
		},
		{
			ID:            "rappi-yield-emergencia",
			Name:          "RappiPay: Abono Rendimientos Emergencia ($3.210)",
			Bank:          "RappiPay",
			ActionType:    models.TypeYieldPayout,
			Title:         "RappiCuenta",
			Text:          "Tu abono de rendimientos por $3.210 ha sido acreditado en Fondo de emergencia. Saldo: $1.073.210",
			TargetAccount: "Fondo de emergencia",
			Amount:        3210,
			Description:   "Abono Rendimientos RappiCuenta",
			Category:      "Rendimientos",
		},
		{
			ID:            "rappi-restaurante",
			Name:          "RappiPay: Compra Restaurante ($40.000)",
			Bank:          "RappiPay",
			ActionType:    models.TypeDebit,
			Title:         "RappiCuenta",
			Text:          "Compraste por $40.000 en CREPES AND WAFLES con tu tarjeta RappiPay",
			TargetAccount: "Cuenta Rappi (Principal)",
			Amount:        40000,
			Description:   "Compra CREPES AND WAFLES",
			Category:      "Restaurantes",
		},

		// === PLENTI ===
		{
			ID:            "plenti-yield",
			Name:          "Plenti: Rendimiento Diario Bolsillo ($450)",
			Bank:          "Plenti (Ahorros)",
			ActionType:    models.TypeYieldPayout,
			Title:         "Plenti",
			Text:          "Tu rendimiento diario de $450 ya está disponible en tu Bolsillo a la vista",
			TargetAccount: "Bolsillo a la vista",
			Amount:        450,
			Description:   "Rendimiento Diario Plenti",
			Category:      "Rendimientos",
		},

		// === BANCOLOMBIA ===
		{
			ID:            "bancolombia-exito",
			Name:          "Bancolombia: Compra Tarjeta Débito ($65.000)",
			Bank:          "Bancolombia",
			ActionType:    models.TypeDebit,
			Title:         "Bancolombia",
			Text:          "Bancolombia le informa compra por $65.000 en ALMACEN EXITO con tarjeta debito *1234",
			TargetAccount: "Cuenta Nómina / Principal",
			Amount:        65000,
			Description:   "Compra ALMACEN EXITO",
			Category:      "Mercado",
		},

		// === BANCO CAJA SOCIAL ===
		{
			ID:            "bcs-atm",
			Name:          "Banco Caja Social: Retiro Cajero ($100.000)",
			Bank:          "Banco Caja Social",
			ActionType:    models.TypeDebit,
			Title:         "Banco Caja Social",
			Text:          "Banco Caja Social le informa retiro por $100.000 en Cajero Unicentro",
			TargetAccount: "Cuenta Principal",
			Amount:        100000,
			Description:   "Retiro Cajero Unicentro",
			Category:      "Efectivo",
		},

		// === GOOGLE WALLET (NFC) ===
		{
			ID:            "wallet-starbucks",
			Name:          "Google Wallet: Pago NFC Starbucks ($22.500)",
			Bank:          "Nu Colombia",
			ActionType:    models.TypeDebit,
			Title:         "STARBUCKS",
			Text:          "Pagaste $22.500 con tu tarjeta Nu en STARBUCKS",
			TargetAccount: "Cuenta Nu Débito (Nómina)",
			Amount:        22500,
			Description:   "STARBUCKS",
			Category:      "Café y Salidas",
		},

		// === NEQUI COLOMBIA ===
		{
			ID:            "nequi-transfer-in",
			Name:          "Nequi: Transferencia Recibida ($50.000)",
			Bank:          "Nequi Colombia",
			ActionType:    models.TypeCredit,
			Title:         "Nequi",
			Text:          "¡Te transfirieron $50.000! Tu nuevo saldo disponible es $58.047,40",
			TargetAccount: "Disponible Nequi",
			Amount:        50000,
			Description:   "Transferencia recibida Nequi",
			Category:      "Transferencias",
		},
		{
			ID:            "nequi-debit-payment",
			Name:          "Nequi: Pago Comercio / QR ($25.000)",
			Bank:          "Nequi Colombia",
			ActionType:    models.TypeDebit,
			Title:         "Nequi",
			Text:          "Pagaste $25.000 en TIENDA D1 con tu Nequi",
			TargetAccount: "Disponible Nequi",
			Amount:        25000,
			Description:   "Compra TIENDA D1",
			Category:      "Mercado",
		},

		// === DAVIPLATA ===
		{
			ID:            "daviplata-debit-payment",
			Name:          "Daviplata: Compra en Comercio ($20.000)",
			Bank:          "Davivienda / Daviplata",
			ActionType:    models.TypeDebit,
			Title:         "DaviPlata",
			Text:          "DaviPlata: Pagaste $20.000 en PANADERIA LA 80",
			TargetAccount: "Daviplata Principal",
			Amount:        20000,
			Description:   "Compra PANADERIA LA 80",
			Category:      "Alimentación",
		},

		// === RAPPIPAY CASCADA SOBREGIRO ===
		{
			ID:            "rappi-cascada-impresora",
			Name:          "RappiPay: Sobregiro Cascada Impresora ($300.000)",
			Bank:          "RappiPay",
			ActionType:    models.TypeDebit,
			Title:         "RappiCuenta",
			Text:          "Compraste por $300.000 en HP STORE COLOMBIA con cargo a Impresora",
			TargetAccount: "Impresora",
			Amount:        300000,
			Description:   "Compra HP STORE COLOMBIA (Sobregiro Cascada)",
			Category:      "Tecnología",
		},
	}
}

// FindPresetByID looks up a preset by its identifier.
func FindPresetByID(id string) (*models.SimulatedPreset, error) {
	presets := GetDefaultPresets()
	for _, p := range presets {
		if strings.EqualFold(p.ID, id) {
			return &p, nil
		}
	}
	return nil, fmt.Errorf("preset with id '%s' not found", id)
}

package simulator

import (
	"testing"

	"titanes-portfolio/bank-simulator/pkg/parser"
)

func TestAllDefaultPresetsParseSuccessfully(t *testing.T) {
	presets := GetDefaultPresets()
	if len(presets) < 10 {
		t.Fatalf("expected at least 10 presets, got %d", len(presets))
	}

	engine := parser.NewEngine()

	for _, p := range presets {
		t.Run(p.ID, func(t *testing.T) {
			raw := p.ToRawNotification()
			parsed, err := engine.Parse(raw)
			if err != nil {
				t.Fatalf("failed to parse preset '%s': %v", p.ID, err)
			}

			if parsed.Amount <= 0 {
				t.Errorf("preset '%s': parsed amount must be > 0, got %f", p.ID, parsed.Amount)
			}

			if parsed.Type != p.ActionType {
				t.Errorf("preset '%s': expected type %s, got %s", p.ID, p.ActionType, parsed.Type)
			}
		})
	}
}

func TestFindPresetByID(t *testing.T) {
	p, err := FindPresetByID("nu-salary")
	if err != nil {
		t.Fatalf("unexpected error finding preset: %v", err)
	}
	if p.Bank != "Nu Colombia" {
		t.Errorf("expected Nu Colombia, got %s", p.Bank)
	}

	_, errNotFound := FindPresetByID("non-existent-id")
	if errNotFound == nil {
		t.Errorf("expected error for non-existent preset id")
	}
}

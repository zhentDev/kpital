package parser

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var (
	ErrEmptyAmount   = errors.New("empty amount string")
	ErrInvalidAmount = errors.New("cannot parse amount as valid float")
	cleanCharRegex   = regexp.MustCompile(`[^\d\.,]`)
)

// ParseCOPAmount parses Colombian currency formats reliably into float64.
//
// Handles:
//   - "$33.500,00"   -> 33500.00
//   - "$ 9.400,00"   -> 9400.00
//   - "1.250.000,50" -> 1250000.50
//   - "$45.000"      -> 45000.00
//   - "35000"        -> 35000.00
//   - "$ 28,500"     -> 28500.00
func ParseCOPAmount(raw string) (float64, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, ErrEmptyAmount
	}

	// Remove currency symbols, words, whitespace
	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, "COP", "")
	s = strings.ReplaceAll(s, "cop", "")
	s = strings.TrimSpace(s)
	s = cleanCharRegex.ReplaceAllString(s, "")

	if s == "" {
		return 0, ErrEmptyAmount
	}

	hasDot := strings.Contains(s, ".")
	hasComma := strings.Contains(s, ",")

	switch {
	case hasDot && hasComma:
		// Check which comes last
		lastDot := strings.LastIndex(s, ".")
		lastComma := strings.LastIndex(s, ",")
		if lastComma > lastDot {
			// e.g. 1.250.000,50 (Colombian standard: dot=thousands, comma=decimals)
			s = strings.ReplaceAll(s, ".", "")
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			// e.g. 1,250,000.50 (US standard: comma=thousands, dot=decimals)
			s = strings.ReplaceAll(s, ",", "")
		}

	case hasComma && !hasDot:
		parts := strings.Split(s, ",")
		if len(parts) == 2 && (len(parts[1]) == 1 || len(parts[1]) == 2) {
			// e.g. 35000,50 or 45,5 -> comma is decimal
			s = parts[0] + "." + parts[1]
		} else {
			// e.g. 35,000 -> comma is thousands
			s = strings.ReplaceAll(s, ",", "")
		}

	case hasDot && !hasComma:
		parts := strings.Split(s, ".")
		// If last part has 3 digits or multiple dots exist, dot is thousands separator (e.g. 45.000 or 1.250.000)
		if len(parts) > 2 || (len(parts) == 2 && len(parts[1]) == 3) {
			s = strings.ReplaceAll(s, ".", "")
		}
	}

	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, errors.Join(ErrInvalidAmount, err)
	}

	return math.Abs(val), nil
}

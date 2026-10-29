// Centralized affiliate referral configuration for Kpital Zhent
// These links and codes are displayed to all users to monetize the terminal organically.

export const REFERRAL_LINKS = {
  nu: {
    name: "Nu Colombia",
    tagline: "Cajitas con rendimiento diario y Tarjeta de Crédito sin cuota de manejo",
    badge: "9.30% E.A.",
    url: "https://nu.com.co/mgm/?id=p8AduCZgEQyaX3cuNjpgbg&msg=e4581&utm_channel=referral&utm_medium=referral&utm_source=mgm&ticket_id=ticket_5&origin-mgm=settings-revamp",
    code: "p8AduCZgEQyaX3cuNjpgbg",
    category: "bank",
  },
  rappi: {
    name: "RappiPay",
    tagline: "RappiCuenta con alta rentabilidad diaria y tarjeta Débito sin costo",
    badge: "14.00% E.A.",
    url: "https://rappi.sng.link/Ev50a/kp0r/r_91bb278ddc",
    code: "jesus4034276",
    category: "bank",
  },
  plenti: {
    name: "Plenti",
    tagline: "Ahorra y rentabiliza en dólares digitales y oro con rendimientos diarios",
    badge: "Dólares & Oro",
    url: "https://r.plenti.com.co/jesus821",
    code: "jesus821",
    category: "fintech",
  },
  arq: {
    name: "ARQ Finance (antes DolarApp)",
    tagline: "Cuenta en dólares y tarjeta global sin comisiones de tipo de cambio",
    badge: "Finanzas Globales",
    url: "https://www.arqfinance.com/referrals/general?referralCode=jesuscaballero_fIy&pid=referral&c=general&is_retargeting=true",
    code: "jesuscaballero_fIy",
    category: "fintech",
  },
  lemon: {
    name: "Lemon Cash",
    tagline: "Compra Bitcoin y criptomonedas con cashback y rendimientos semanales",
    badge: "Ganá Bitcoin ₿",
    url: "https://lemon.go.link/8r5k6",
    code: "caballerojesus703",
    category: "crypto",
  },
  ibkr: {
    name: "Interactive Brokers",
    tagline: "Opera acciones y ETFs globales en Wall Street con acceso institucional",
    badge: "Wall Street 0%",
    url: "https://www.interactivebrokers.com/",
    code: null,
    category: "broker",
  },
};

/**
 * Returns referral data for a given entity name or id
 */
export function getReferralForEntity(entityNameOrId = "") {
  const q = (entityNameOrId || "").toLowerCase();
  if (q.includes("nu")) return REFERRAL_LINKS.nu;
  if (q.includes("rappi")) return REFERRAL_LINKS.rappi;
  if (q.includes("plenti")) return REFERRAL_LINKS.plenti;
  if (q.includes("arq") || q.includes("dolarapp")) return REFERRAL_LINKS.arq;
  if (q.includes("lemon")) return REFERRAL_LINKS.lemon;
  if (q.includes("interactive") || q.includes("ibkr")) return REFERRAL_LINKS.ibkr;
  return null;
}

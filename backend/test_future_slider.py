from datetime import datetime, timedelta
import math

current_balance = 2169997.89
current_capital = 1720542.30
current_earnings = 449455.59
current_rate_ea = 9.88

today = datetime.now()

print("=== SIMULACIÓN DE PROYECCIÓN A FUTURO (TASA VIGENTE 9.88% E.A.) ===")
for years in [1, 2, 3, 5, 10]:
    days = int(years * 365.25)
    # Compound interest in base 360
    future_balance = current_balance * ((1.0 + current_rate_ea / 100.0) ** (days / 360.0))
    future_yield = current_earnings + (future_balance - current_balance)
    monthly_passive_income = future_balance * (((1.0 + current_rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0) * 30.416
    future_date = today + timedelta(days=days)
    
    print(f"+{years:2d} Años ({future_date.strftime('%b %Y')}): Saldo = ${future_balance:12,.2f} COP | Ganancia = +${future_yield:12,.2f} COP | Renta Pasiva = ${monthly_passive_income:8,.2f} COP/mes")

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional
from services.db import get_connection, pg_execute, DATABASE_URL
from services.market_data import get_fx_data, get_colombia_cpi_history
from services.auth import get_optional_current_user
import json

router = APIRouter()


@router.get("/purchases/inflation/colombia")
def get_inflation_colombia():
    return get_colombia_cpi_history()


@router.get("/purchases/fx")
def get_fx_history(currency: str):
    return get_fx_data(currency)


class PortfolioItem(BaseModel):
    id: str
    name: str
    isPlan: Optional[bool] = False
    planConfig: Optional[dict] = None
    assetCurrency: Optional[str] = "USD"
    localCurrency: Optional[str] = "COP"
    inflationRate: Optional[float] = 0.0
    useAutoColInflation: Optional[bool] = False


class PurchaseLot(BaseModel):
    id: str
    portfolioId: str
    ticker: str
    date: str
    purchasePrice: float
    shares: float
    manualCurrentPrice: Optional[float] = None
    purchaseTime: Optional[str] = None
    commissionAmount: Optional[float] = 0.0
    notes: Optional[str] = None


class SaleItem(BaseModel):
    id: str
    lotId: Optional[str] = None
    portfolioId: str
    ticker: str
    saleDate: str
    saleTime: Optional[str] = None
    salePrice: float
    shares: float
    saleCommission: Optional[float] = 0.0
    realizedPnl: Optional[float] = 0.0
    notes: Optional[str] = None
    purchaseDate: Optional[str] = None
    costBasis: Optional[float] = 0.0


class SyncPayload(BaseModel):
    purchasePortfolios: List[PortfolioItem]
    individualPurchases: List[PurchaseLot]
    purchaseSales: Optional[List[SaleItem]] = []


@router.get("/purchases/portfolios")
def get_all_purchases_data(request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    # For owner or local dev without session: fallback to OWNER_ID 'usr_9487dd2209d2'
    effective_user_id = user_id or "usr_9487dd2209d2"

    with get_connection() as con:
        portfolios = con.execute(
            """
            SELECT id, name, is_plan, plan_config, asset_currency, local_currency, annual_inflation_rate, use_auto_col_inflation 
            FROM purchase_portfolios 
            WHERE user_id = ? OR user_id IS NULL
            """,
            [effective_user_id],
        ).fetchall()
        lots = con.execute(
            """
            SELECT id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price, purchase_time, commission_amount, notes 
            FROM individual_purchases 
            WHERE user_id = ? OR user_id IS NULL
            """,
            [effective_user_id],
        ).fetchall()
        sales = con.execute(
            """
            SELECT id, lot_id, portfolio_id, ticker, sale_date, sale_time, sale_price, shares, sale_commission, realized_pnl, notes, purchase_date, cost_basis
            FROM purchase_sales
            WHERE user_id = ? OR user_id IS NULL
            """,
            [effective_user_id],
        ).fetchall()

        return {
            "purchasePortfolios": [
                {
                    "id": p[0],
                    "name": p[1],
                    "isPlan": bool(p[2]),
                    "planConfig": json.loads(p[3]) if p[3] else None,
                    "assetCurrency": p[4],
                    "localCurrency": p[5],
                    "inflationRate": p[6],
                    "useAutoColInflation": bool(p[7]),
                }
                for p in portfolios
            ],
            "individualPurchases": [
                {
                    "id": lot[0],
                    "portfolioId": lot[1],
                    "ticker": lot[2],
                    "date": str(lot[3]),
                    "purchasePrice": lot[4],
                    "shares": lot[5],
                    "manualCurrentPrice": lot[6],
                    "purchaseTime": lot[7] if len(lot) > 7 else None,
                    "commissionAmount": lot[8] if len(lot) > 8 and lot[8] is not None else 0.0,
                    "notes": lot[9] if len(lot) > 9 else None,
                }
                for lot in lots
            ],
            "purchaseSales": [
                {
                    "id": s[0],
                    "lotId": s[1],
                    "portfolioId": s[2],
                    "ticker": s[3],
                    "saleDate": str(s[4]),
                    "saleTime": s[5],
                    "salePrice": s[6],
                    "shares": s[7],
                    "saleCommission": s[8] if len(s) > 8 and s[8] is not None else 0.0,
                    "realizedPnl": s[9] if len(s) > 9 and s[9] is not None else 0.0,
                    "notes": s[10] if len(s) > 10 else None,
                    "purchaseDate": str(s[11]) if len(s) > 11 and s[11] is not None else None,
                    "costBasis": s[12] if len(s) > 12 and s[12] is not None else 0.0,
                }
                for s in sales
            ],
        }


@router.post("/purchases/portfolios")
def create_portfolio(item: PortfolioItem, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    config_str = json.dumps(item.planConfig) if item.planConfig else None

    if DATABASE_URL:
        pg_execute(
            """
            INSERT INTO purchase_portfolios (id, name, is_plan, plan_config, asset_currency, local_currency, annual_inflation_rate, use_auto_col_inflation, user_id) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) 
            ON CONFLICT (id) DO UPDATE SET 
            name=EXCLUDED.name, 
            is_plan=EXCLUDED.is_plan, 
            plan_config=EXCLUDED.plan_config,
            asset_currency=EXCLUDED.asset_currency,
            local_currency=EXCLUDED.local_currency,
            annual_inflation_rate=EXCLUDED.annual_inflation_rate,
            use_auto_col_inflation=EXCLUDED.use_auto_col_inflation,
            user_id=COALESCE(EXCLUDED.user_id, purchase_portfolios.user_id)
            """,
            [
                item.id,
                item.name,
                item.isPlan,
                config_str,
                item.assetCurrency,
                item.localCurrency,
                item.inflationRate,
                item.useAutoColInflation,
                user_id,
            ],
        )

    with get_connection() as con:
        con.execute(
            """
            INSERT INTO purchase_portfolios (id, name, is_plan, plan_config, asset_currency, local_currency, annual_inflation_rate, use_auto_col_inflation, user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) 
            ON CONFLICT (id) DO UPDATE SET 
            name=EXCLUDED.name, 
            is_plan=EXCLUDED.is_plan, 
            plan_config=EXCLUDED.plan_config,
            asset_currency=EXCLUDED.asset_currency,
            local_currency=EXCLUDED.local_currency,
            annual_inflation_rate=EXCLUDED.annual_inflation_rate,
            use_auto_col_inflation=EXCLUDED.use_auto_col_inflation,
            user_id=COALESCE(EXCLUDED.user_id, purchase_portfolios.user_id)
            """,
            [
                item.id,
                item.name,
                item.isPlan,
                config_str,
                item.assetCurrency,
                item.localCurrency,
                item.inflationRate,
                item.useAutoColInflation,
                user_id,
            ],
        )
    return {"success": True}


class PlanTogglePayload(BaseModel):
    isPlan: bool
    planConfig: Optional[dict] = None


@router.put("/purchases/portfolios/{portfolio_id}/plan")
def toggle_portfolio_plan(portfolio_id: str, payload: PlanTogglePayload):
    config_str = json.dumps(payload.planConfig) if payload.planConfig else None
    if DATABASE_URL:
        pg_execute(
            "UPDATE purchase_portfolios SET is_plan = %s, plan_config = %s WHERE id = %s",
            [payload.isPlan, config_str, portfolio_id],
        )

    with get_connection() as con:
        con.execute(
            "UPDATE purchase_portfolios SET is_plan = ?, plan_config = ? WHERE id = ?",
            [payload.isPlan, config_str, portfolio_id],
        )
    return {"success": True}


class PortfolioSettingsPayload(BaseModel):
    assetCurrency: str
    localCurrency: str
    inflationRate: float
    useAutoColInflation: bool


@router.put("/purchases/portfolios/{portfolio_id}/settings")
def update_portfolio_settings(portfolio_id: str, payload: PortfolioSettingsPayload):
    if DATABASE_URL:
        pg_execute(
            "UPDATE purchase_portfolios SET asset_currency = %s, local_currency = %s, annual_inflation_rate = %s, use_auto_col_inflation = %s WHERE id = %s",
            [
                payload.assetCurrency,
                payload.localCurrency,
                payload.inflationRate,
                payload.useAutoColInflation,
                portfolio_id,
            ],
        )

    with get_connection() as con:
        con.execute(
            "UPDATE purchase_portfolios SET asset_currency = ?, local_currency = ?, annual_inflation_rate = ?, use_auto_col_inflation = ? WHERE id = ?",
            [
                payload.assetCurrency,
                payload.localCurrency,
                payload.inflationRate,
                payload.useAutoColInflation,
                portfolio_id,
            ],
        )
    return {"success": True}


@router.delete("/purchases/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: str):
    if DATABASE_URL:
        pg_execute("DELETE FROM purchase_sales WHERE portfolio_id = %s", [portfolio_id])
        pg_execute("DELETE FROM individual_purchases WHERE portfolio_id = %s", [portfolio_id])
        pg_execute("DELETE FROM purchase_portfolios WHERE id = %s", [portfolio_id])

    with get_connection() as con:
        con.execute("DELETE FROM individual_purchases WHERE portfolio_id = ?", [portfolio_id])
        con.execute("DELETE FROM purchase_portfolios WHERE id = ?", [portfolio_id])
    return {"success": True}


@router.post("/purchases/lots")
def create_lot(lot: PurchaseLot, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"

    if DATABASE_URL:
        pg_execute(
            """
            INSERT INTO individual_purchases 
            (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price, purchase_time, commission_amount, notes, user_id) 
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET 
                portfolio_id=EXCLUDED.portfolio_id,
                ticker=EXCLUDED.ticker,
                date=EXCLUDED.date,
                purchase_price=EXCLUDED.purchase_price,
                shares=EXCLUDED.shares,
                manual_current_price=EXCLUDED.manual_current_price,
                purchase_time=EXCLUDED.purchase_time,
                commission_amount=EXCLUDED.commission_amount,
                notes=EXCLUDED.notes,
                user_id=COALESCE(EXCLUDED.user_id, individual_purchases.user_id)
            """,
            [
                lot.id,
                lot.portfolioId,
                lot.ticker,
                lot.date,
                lot.purchasePrice,
                lot.shares,
                lot.manualCurrentPrice,
                lot.purchaseTime,
                lot.commissionAmount or 0.0,
                lot.notes,
                user_id,
            ],
        )

    with get_connection() as con:
        con.execute(
            """
            INSERT INTO individual_purchases 
            (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price, purchase_time, commission_amount, notes, user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET 
                portfolio_id=EXCLUDED.portfolio_id,
                ticker=EXCLUDED.ticker,
                date=EXCLUDED.date,
                purchase_price=EXCLUDED.purchase_price,
                shares=EXCLUDED.shares,
                manual_current_price=EXCLUDED.manual_current_price,
                purchase_time=EXCLUDED.purchase_time,
                commission_amount=EXCLUDED.commission_amount,
                notes=EXCLUDED.notes,
                user_id=COALESCE(EXCLUDED.user_id, individual_purchases.user_id)
            """,
            [
                lot.id,
                lot.portfolioId,
                lot.ticker,
                lot.date,
                lot.purchasePrice,
                lot.shares,
                lot.manualCurrentPrice,
                lot.purchaseTime,
                lot.commissionAmount or 0.0,
                lot.notes,
                user_id,
            ],
        )
    return {"success": True}


@router.put("/purchases/lots")
def update_lots(lots: List[PurchaseLot], request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None

    if DATABASE_URL:
        for lot in lots:
            pg_execute(
                """
                UPDATE individual_purchases 
                SET portfolio_id=%s, ticker=%s, date=%s, purchase_price=%s, shares=%s, manual_current_price=%s, purchase_time=%s, commission_amount=%s, notes=%s
                WHERE id=%s
                """,
                [
                    lot.portfolioId,
                    lot.ticker,
                    lot.date,
                    lot.purchasePrice,
                    lot.shares,
                    lot.manualCurrentPrice,
                    lot.purchaseTime,
                    lot.commissionAmount or 0.0,
                    lot.notes,
                    lot.id,
                ],
            )

    with get_connection() as con:
        for lot in lots:
            con.execute(
                """
                UPDATE individual_purchases 
                SET portfolio_id=?, ticker=?, date=?, purchase_price=?, shares=?, manual_current_price=?, purchase_time=?, commission_amount=?, notes=?
                WHERE id=?
                """,
                [
                    lot.portfolioId,
                    lot.ticker,
                    lot.date,
                    lot.purchasePrice,
                    lot.shares,
                    lot.manualCurrentPrice,
                    lot.purchaseTime,
                    lot.commissionAmount or 0.0,
                    lot.notes,
                    lot.id,
                ],
            )
    return {"success": True}


@router.delete("/purchases/lots/{lot_id}")
def delete_lot(lot_id: str):
    if DATABASE_URL:
        pg_execute("DELETE FROM individual_purchases WHERE id = %s", [lot_id])

    with get_connection() as con:
        con.execute("DELETE FROM individual_purchases WHERE id = ?", [lot_id])
    return {"success": True}


@router.post("/purchases/sync")
def sync_migration(payload: SyncPayload, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None

    if DATABASE_URL:
        for p in payload.purchasePortfolios:
            pg_execute(
                "INSERT INTO purchase_portfolios (id, name, user_id) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                [p.id, p.name, user_id],
            )
        for lot in payload.individualPurchases:
            pg_execute(
                """
                INSERT INTO individual_purchases 
                (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price, purchase_time, commission_amount, notes, user_id) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                [
                    lot.id,
                    lot.portfolioId,
                    lot.ticker,
                    lot.date,
                    lot.purchasePrice,
                    lot.shares,
                    lot.manualCurrentPrice,
                    lot.purchaseTime,
                    lot.commissionAmount or 0.0,
                    lot.notes,
                    user_id,
                ],
            )
        if payload.purchaseSales:
            for s in payload.purchaseSales:
                pg_execute(
                    """
                    INSERT INTO purchase_sales
                    (id, lot_id, portfolio_id, ticker, sale_date, sale_time, sale_price, shares, sale_commission, realized_pnl, notes, user_id, purchase_date, cost_basis)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    [
                        s.id,
                        s.lotId,
                        s.portfolioId,
                        s.ticker,
                        s.saleDate,
                        s.saleTime,
                        s.salePrice,
                        s.shares,
                        s.saleCommission or 0.0,
                        s.realizedPnl or 0.0,
                        s.notes,
                        user_id,
                        s.purchaseDate,
                        s.costBasis or 0.0,
                    ],
                )

    with get_connection() as con:
        for p in payload.purchasePortfolios:
            con.execute(
                "INSERT INTO purchase_portfolios (id, name, user_id) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING",
                [p.id, p.name, user_id],
            )
        for lot in payload.individualPurchases:
            con.execute(
                """
                INSERT INTO individual_purchases 
                (id, portfolio_id, ticker, date, purchase_price, shares, manual_current_price, purchase_time, commission_amount, notes, user_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO NOTHING
                """,
                [
                    lot.id,
                    lot.portfolioId,
                    lot.ticker,
                    lot.date,
                    lot.purchasePrice,
                    lot.shares,
                    lot.manualCurrentPrice,
                    lot.purchaseTime,
                    lot.commissionAmount or 0.0,
                    lot.notes,
                    user_id,
                ],
            )
        if payload.purchaseSales:
            for s in payload.purchaseSales:
                con.execute(
                    """
                    INSERT INTO purchase_sales
                    (id, lot_id, portfolio_id, ticker, sale_date, sale_time, sale_price, shares, sale_commission, realized_pnl, notes, user_id, purchase_date, cost_basis)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    [
                        s.id,
                        s.lotId,
                        s.portfolioId,
                        s.ticker,
                        s.saleDate,
                        s.saleTime,
                        s.salePrice,
                        s.shares,
                        s.saleCommission or 0.0,
                        s.realizedPnl or 0.0,
                        s.notes,
                        user_id,
                        s.purchaseDate,
                        s.costBasis or 0.0,
                    ],
                )
    return {
        "success": True,
        "migratedPortfolios": len(payload.purchasePortfolios),
        "migratedLots": len(payload.individualPurchases),
        "migratedSales": len(payload.purchaseSales or []),
    }


@router.post("/purchases/sales")
def create_sale(sale: SaleItem, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"

    if DATABASE_URL:
        pg_execute(
            """
            INSERT INTO purchase_sales
            (id, lot_id, portfolio_id, ticker, sale_date, sale_time, sale_price, shares, sale_commission, realized_pnl, notes, user_id, purchase_date, cost_basis)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                lot_id=EXCLUDED.lot_id,
                portfolio_id=EXCLUDED.portfolio_id,
                ticker=EXCLUDED.ticker,
                sale_date=EXCLUDED.sale_date,
                sale_time=EXCLUDED.sale_time,
                sale_price=EXCLUDED.sale_price,
                shares=EXCLUDED.shares,
                sale_commission=EXCLUDED.sale_commission,
                realized_pnl=EXCLUDED.realized_pnl,
                notes=EXCLUDED.notes,
                user_id=COALESCE(EXCLUDED.user_id, purchase_sales.user_id),
                purchase_date=COALESCE(EXCLUDED.purchase_date, purchase_sales.purchase_date),
                cost_basis=COALESCE(EXCLUDED.cost_basis, purchase_sales.cost_basis)
            """,
            [
                sale.id,
                sale.lotId,
                sale.portfolioId,
                sale.ticker,
                sale.saleDate,
                sale.saleTime,
                sale.salePrice,
                sale.shares,
                sale.saleCommission or 0.0,
                sale.realizedPnl or 0.0,
                sale.notes,
                user_id,
                sale.purchaseDate,
                sale.costBasis or 0.0,
            ],
        )

    with get_connection() as con:
        con.execute(
            """
            INSERT INTO purchase_sales
            (id, lot_id, portfolio_id, ticker, sale_date, sale_time, sale_price, shares, sale_commission, realized_pnl, notes, user_id, purchase_date, cost_basis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                lot_id=EXCLUDED.lot_id,
                portfolio_id=EXCLUDED.portfolio_id,
                ticker=EXCLUDED.ticker,
                sale_date=EXCLUDED.sale_date,
                sale_time=EXCLUDED.sale_time,
                sale_price=EXCLUDED.sale_price,
                shares=EXCLUDED.shares,
                sale_commission=EXCLUDED.sale_commission,
                realized_pnl=EXCLUDED.realized_pnl,
                notes=EXCLUDED.notes,
                user_id=COALESCE(EXCLUDED.user_id, purchase_sales.user_id),
                purchase_date=COALESCE(EXCLUDED.purchase_date, purchase_sales.purchase_date),
                cost_basis=COALESCE(EXCLUDED.cost_basis, purchase_sales.cost_basis)
            """,
            [
                sale.id,
                sale.lotId,
                sale.portfolioId,
                sale.ticker,
                sale.saleDate,
                sale.saleTime,
                sale.salePrice,
                sale.shares,
                sale.saleCommission or 0.0,
                sale.realizedPnl or 0.0,
                sale.notes,
                user_id,
                sale.purchaseDate,
                sale.costBasis or 0.0,
            ],
        )
    return {"success": True}


@router.delete("/purchases/sales/{sale_id}")
def delete_sale(sale_id: str):
    if DATABASE_URL:
        pg_execute("DELETE FROM purchase_sales WHERE id = %s", [sale_id])

    with get_connection() as con:
        con.execute("DELETE FROM purchase_sales WHERE id = ?", [sale_id])
    return {"success": True}

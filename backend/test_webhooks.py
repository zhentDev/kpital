"""Test suite for Mobile Webhook endpoints in Titanes Portfolio."""

import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
SECRET_KEY = "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"


def test_auth_rejection():
    print("-> Testing auth rejection (no token)...")
    res = client.get("/api/webhooks/health")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"

    print("-> Testing auth rejection (invalid token)...")
    res = client.get("/api/webhooks/health", headers={"X-Webhook-Secret": "invalid_token"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("OK: Unauthorized requests properly blocked.")


def test_health_with_secret():
    print("-> Testing healthcheck with valid X-Webhook-Secret header...")
    res = client.get("/api/webhooks/health", headers={"X-Webhook-Secret": SECRET_KEY})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data.get("status") == "healthy"
    print(f"OK: Health endpoint answered: {data}")

    print("-> Testing healthcheck with ?token= query parameter...")
    res2 = client.get(f"/api/webhooks/health?token={SECRET_KEY}")
    assert res2.status_code == 200
    assert res2.json().get("status") == "healthy"
    print("OK: Query param authentication works.")


def test_list_mobile_accounts():
    print("-> Testing GET /api/webhooks/mobile-accounts...")
    res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data.get("success") is True
    assert "entities" in data
    print(f"OK: Found {data.get('total_entities')} entities and {data.get('total_accounts')} accounts.")
    for e in data.get("entities", []):
        pockets = [f"{a['name']} (${a['balance']:,.0f})" for a in e.get("accounts", [])]
        print(f"   * {e['name']}: {', '.join(pockets) if pockets else 'Sin bolsillos'}")


def test_mobile_transaction_flow():
    print("-> Testing POST /api/webhooks/mobile-transaction (Debit Nu Cajita Viaje)...")
    
    # 1. Get initial balance
    acc_res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    accounts = []
    for ent in acc_res.json().get("entities", []):
        for acc in ent.get("accounts", []):
            if "viaje" in acc["name"].lower():
                accounts.append(acc)
    
    assert len(accounts) > 0, "No Cajita Viaje found"
    initial_balance = accounts[0]["balance"]
    print(f"   Initial balance of {accounts[0]['name']}: ${initial_balance:,.2f}")

    # 2. Perform Debit of 1000 COP with formatted string '$1.000'
    test_debit_payload = {
        "entity": "Nu Colombia",
        "account": "Viaje",
        "amount": "$1.000",
        "description": "Test Automatización MacroDroid",
        "type": "debit",
        "raw_text": "Compra en D1 por $1.000 con tu tarjeta Nu"
    }

    post_res = client.post(
        "/api/webhooks/mobile-transaction",
        json=test_debit_payload,
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert post_res.status_code == 200, f"Debit failed: {post_res.status_code}: {post_res.text}"
    debit_data = post_res.json()
    assert debit_data["success"] is True
    new_bal = debit_data["account"]["new_balance"]
    expected_bal = round(initial_balance - 1000.0, 2)
    assert round(new_bal, 2) == expected_bal, f"Expected balance {expected_bal}, got {new_bal}"
    assert debit_data["transaction"]["amount"] == -1000.0
    print(f"   Debit successful! New balance: ${new_bal:,.2f} (Deducted 1,000 COP)")

    # 3. Revert with Credit of 1000 COP to leave balance intact
    print("-> Reverting test debit with credit of 1,000 COP...")
    test_credit_payload = {
        "entity": "Nu Colombia",
        "account": "acc_viaje",
        "amount": 1000.0,
        "description": "Reversión Test Automatización",
        "type": "credit"
    }
    credit_res = client.post(
        "/api/webhooks/mobile-transaction",
        json=test_credit_payload,
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert credit_res.status_code == 200
    reverted_bal = credit_res.json()["account"]["new_balance"]
    assert round(reverted_bal, 2) == round(initial_balance, 2)
    print(f"   Reversion successful! Balance restored to: ${reverted_bal:,.2f}")


def test_nequi_wallet_flow():
    print("-> Testing Nequi digital wallet webhook entry & exit...")
    # Fetch initial balance
    res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    all_accounts = [acc for ent in res.json().get("entities", []) for acc in ent.get("accounts", [])]
    accounts_by_id = {a["id"]: a for a in all_accounts}
    nequi_acc = accounts_by_id.get("acc_nequi_disp")
    assert nequi_acc is not None, "acc_nequi_disp not found in mobile accounts"
    assert nequi_acc.get("accountCategory") == "digital_wallet"
    init_nequi_bal = float(nequi_acc["balance"])

    # Test Credit of 5,000 COP
    credit_res = client.post(
        "/api/webhooks/mobile-transaction",
        json={
            "entity": "Nequi",
            "account": "acc_nequi_disp",
            "amount": 5000.0,
            "description": "Test Abono Nequi",
            "type": "credit"
        },
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert credit_res.status_code == 200
    assert round(credit_res.json()["account"]["new_balance"], 2) == round(init_nequi_bal + 5000.0, 2)

    # Revert with Debit of 5,000 COP
    debit_res = client.post(
        "/api/webhooks/mobile-transaction",
        json={
            "entity": "Nequi",
            "account": "acc_nequi_disp",
            "amount": 5000.0,
            "description": "Reversión Test Abono Nequi",
            "type": "debit"
        },
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert debit_res.status_code == 200
    assert round(debit_res.json()["account"]["new_balance"], 2) == round(init_nequi_bal, 2)
    print(f"OK: Nequi digital wallet transactions verified with intact balance: ${init_nequi_bal:,.2f}")


def test_rappi_cascading_flow():
    print("-> Testing RappiPay pocket cascading debit logic...")
    res = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    all_accounts = [acc for ent in res.json().get("entities", []) for acc in ent.get("accounts", [])]
    accounts_by_id = {a["id"]: a for a in all_accounts}
    # Impresora is acc_1789616855068 or named 'Impresora'
    impresora = next((a for a in all_accounts if a.get("id") == "acc_1789616855068" or "impresora" in a.get("name", "").lower()), None)
    principal = accounts_by_id.get("acc_rappi_principal")
    assert impresora is not None, "acc_1789616855068 (Impresora) not found"
    assert principal is not None, "acc_rappi_principal not found"

    init_impresora_bal = float(impresora["balance"])
    init_principal_bal = float(principal["balance"])

    # Debit that exceeds Impresora balance by 2,000 COP
    overdraft_amount = init_impresora_bal + 2000.0
    cascade_res = client.post(
        "/api/webhooks/mobile-transaction",
        json={
            "entity": "RappiPay",
            "account": "Impresora",
            "amount": overdraft_amount,
            "description": "Compra Equipos Papelería",
            "type": "debit"
        },
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    assert cascade_res.status_code == 200
    c_data = cascade_res.json()
    assert c_data["success"] is True
    assert c_data["account"]["new_balance"] == 0.0, f"Expected 0.0, got {c_data['account']['new_balance']}"
    assert c_data["cascaded"] is True
    assert round(c_data["shortfall"], 2) == 2000.0
    print("   Cascading overdraft executed: pocket dropped to 0, shortfall of 2,000 COP deducted from RappiPay Principal.")

    # Revert state: restore Impresora and RappiPay Principal
    client.post(
        "/api/webhooks/mobile-transaction",
        json={
            "entity": "RappiPay",
            "account": impresora["id"],
            "amount": init_impresora_bal,
            "description": "Reversión Test Impresora",
            "type": "credit"
        },
        headers={"X-Webhook-Secret": SECRET_KEY}
    )
    client.post(
        "/api/webhooks/mobile-transaction",
        json={
            "entity": "RappiPay",
            "account": "acc_rappi_principal",
            "amount": 2000.0,
            "description": "Reversión Test Sobregiro Principal",
            "type": "credit"
        },
        headers={"X-Webhook-Secret": SECRET_KEY}
    )

    # Verify both restored
    res_final = client.get("/api/webhooks/mobile-accounts", headers={"X-Webhook-Secret": SECRET_KEY})
    final_accounts = {a["id"]: a for ent in res_final.json().get("entities", []) for a in ent.get("accounts", [])}
    assert round(float(final_accounts[impresora["id"]]["balance"]), 2) == round(init_impresora_bal, 2)
    assert round(float(final_accounts["acc_rappi_principal"]["balance"]), 2) == round(init_principal_bal, 2)
    print(f"OK: Rappi cascading overdraft test passed and accounts restored perfectly.")


if __name__ == "__main__":
    print("================ RUNNING WEBHOOK TESTS ================")
    test_auth_rejection()
    test_health_with_secret()
    test_list_mobile_accounts()
    test_mobile_transaction_flow()
    test_nequi_wallet_flow()
    test_rappi_cascading_flow()
    print("================ ALL WEBHOOK TESTS PASSED! ================")

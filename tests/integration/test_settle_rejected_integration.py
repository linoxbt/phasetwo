import time

from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

# Same stable, obviously-mismatched pair used by test_release_rejection.py --
# reliably reachs 'rejected' with a small local model.
EVIDENCE_URL = "https://example.com"
SPEC_MISMATCHED = (
    "The submitted page must be a fully functional, live checkout page for an "
    "online shoe store, including a working payment form and a shopping cart."
)

APPEAL_WINDOW_SECONDS = 5  # deployed short so the test can wait it out for real


def _reject_engagement(contract, counterparty_contract, counterparty_address):
    tx = contract.create_engagement(args=[counterparty_address, SPEC_MISMATCHED, future_deadline()]).transact(
        value=1000
    )
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(args=[eid, [EVIDENCE_URL], "Here's the checkout page."]).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL)
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"expected rejected, got {eng['status']}: {eng['decision_reasoning']}"
    return eid


def test_settle_rejected_blocks_while_window_open():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    tx = contract.settle_rejected(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "settle_rejected should be blocked while the appeal window is still open"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected"
    assert eng["funds_released"] is False


def test_settle_rejected_refunds_depositor_once_window_elapses():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    time.sleep(APPEAL_WINDOW_SECONDS + 3)  # let the real GenVM clock pass the window

    tx = contract.settle_rejected(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"settle_rejected failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "refunded"
    assert eng["funds_released"] is True

    # Second settle must be blocked -- status is no longer 'rejected'.
    tx = contract.settle_rejected(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "double settle should have failed"


def test_raise_dispute_blocked_once_window_elapses():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    time.sleep(APPEAL_WINDOW_SECONDS + 3)

    tx = counterparty_contract.raise_dispute(args=[eid, [], "please reconsider"]).transact()
    assert not tx_execution_succeeded(tx), "raise_dispute should be blocked once the appeal window has closed"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected"  # unchanged -- dispute never applied

import time

from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import (
    deploy_surety,
    as_account,
    future_deadline,
    JUDGE_WAIT_RETRIES,
    JUDGE_WAIT_INTERVAL,
    EVIDENCE_HASH,
)

# Same stable, obviously-matching pair used by test_release_approval.py --
# reliably reaches 'approved' with a small local model.
EVIDENCE_URL = "https://example.com"
SPEC_MATCHING = (
    "The submitted page must be IANA's reserved example domain page, and its "
    "body text must contain the exact phrase 'documentation examples'."
)

APPEAL_WINDOW_SECONDS = 5  # deployed short so the test can wait it out for real
REQUIRED_BOND = 50  # 5% of the 1000 deposit, per DISPUTE_BOND_BPS


def _approve_engagement(contract, counterparty_contract, counterparty_address):
    tx = contract.create_engagement(
        args=[counterparty_address, SPEC_MATCHING, future_deadline(), 0, EVIDENCE_URL]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(
        args=[eid, [EVIDENCE_URL], [EVIDENCE_HASH], "See the live page, it's the standard IANA example page."]
    ).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL)
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "approved", f"expected approved, got {eng['status']}: {eng['decision_reasoning']}"
    assert eng["funds_released"] is False
    return eid


def test_settle_approved_blocks_while_window_open():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _approve_engagement(contract, counterparty_contract, counterparty.address)

    tx = contract.settle_approved(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "settle_approved should be blocked while the appeal window is still open"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "approved"
    assert eng["funds_released"] is False


def test_settle_approved_pays_counterparty_once_window_elapses():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _approve_engagement(contract, counterparty_contract, counterparty.address)

    time.sleep(APPEAL_WINDOW_SECONDS + 3)  # let the real GenVM clock pass the window

    tx = contract.settle_approved(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"settle_approved failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "released"
    assert eng["funds_released"] is True

    # Second settle must be blocked -- status is no longer 'approved'.
    tx = contract.settle_approved(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "double settle should have failed"


def test_raise_dispute_blocked_once_approval_window_elapses():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _approve_engagement(contract, counterparty_contract, counterparty.address)

    time.sleep(APPEAL_WINDOW_SECONDS + 3)

    tx = contract.raise_dispute(args=[eid, "please reconsider"]).transact(value=REQUIRED_BOND)
    assert not tx_execution_succeeded(tx), "raise_dispute should be blocked once the appeal window has closed"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "approved"  # unchanged -- dispute never applied


def test_dispute_during_appeal_window_keeps_funds_locked():
    # The economic guarantee the appeal window exists for: a "met" verdict
    # never pays out on the spot, so disputing it while the window is open
    # genuinely blocks the payout -- not just a symbolic disagreement after
    # the money already moved (the old, steward-flagged behavior).
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor, args=[APPEAL_WINDOW_SECONDS])
    counterparty_contract = as_account(contract, counterparty)

    eid = _approve_engagement(contract, counterparty_contract, counterparty.address)

    # Either party may dispute an approved-but-not-yet-settled engagement --
    # here the depositor does, since they're the one who'd want to contest
    # a "met" verdict they disagree with.
    tx = contract.raise_dispute(
        args=[eid, "I don't think this actually satisfies the spec."]
    ).transact(value=REQUIRED_BOND)
    assert tx_execution_succeeded(tx), f"raise_dispute failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "disputed"
    assert eng["funds_released"] is False, "disputing before settlement must keep the deposit locked, not paid out"

    # settle_approved must now be unreachable -- status moved off 'approved'.
    tx = contract.settle_approved(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "settle_approved should be blocked once disputed"

    # Re-judgment runs again; whatever it decides, funds still don't move
    # immediately -- every outcome still goes through its own settlement step.
    tx = contract.request_release(args=[eid]).transact(wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL)
    assert tx_execution_succeeded(tx), f"second request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] in ("approved", "rejected")
    assert eng["funds_released"] is False, "no verdict pays out directly, ever -- only settle_approved/settle_rejected do"

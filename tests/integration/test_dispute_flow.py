from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

EVIDENCE_URL = "https://example.com"
SPEC_MISMATCHED = (
    "The submitted page must be a fully functional, live checkout page for an "
    "online shoe store, including a working payment form and a shopping cart."
)

DISPUTE_BOND = 50  # 5% of the 1000-unit deposit


def test_raise_dispute_retriggers_judgment_on_locked_evidence():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    tx = contract.create_engagement(
        args=[counterparty.address, SPEC_MISMATCHED, future_deadline(), 0, EVIDENCE_URL]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(
        args=[eid, [EVIDENCE_URL], "Here's the checkout page."]
    ).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(
        wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
    )
    assert tx_execution_succeeded(tx), f"first request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"expected initial rejection, got {eng['status']}"
    first_reasoning = eng["decision_reasoning"]
    assert first_reasoning.strip() != ""

    # Either party may dispute a rejected engagement (spec Flow D). Evidence
    # is locked after submit_deliverable - the dispute can only contest the
    # already-committed evidence and force a re-judgment of it, backed by a
    # forfeitable bond (see test_dispute_bond_integration.py for the full
    # bond bookkeeping proof).
    tx = counterparty_contract.raise_dispute(
        args=[eid, "I believe this does satisfy the spec, please re-review."]
    ).transact(value=DISPUTE_BOND)
    assert tx_execution_succeeded(tx), f"raise_dispute failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "disputed"
    assert eng["dispute_round"] == 1
    assert len(eng["evidence_urls"]) == 1  # unchanged - evidence is locked
    assert eng["dispute_bond"] == DISPUTE_BOND

    # Re-judgment must actually run again (not a cached/no-op result) --
    # request_release accepts "disputed" as a valid starting status.
    tx = contract.request_release(args=[eid]).transact(
        wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
    )
    assert tx_execution_succeeded(tx), f"second request_release failed: {tx}"

    # Same evidence, same obviously-mismatched spec - the re-judgment
    # reliably reproduces the same rejection, so the bond is forfeited
    # (resolved and reset to 0) rather than refunded.
    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"unexpected status after re-judgment: {eng['status']}"
    assert eng["decision_reasoning"].strip() != ""
    assert eng["dispute_bond"] == 0

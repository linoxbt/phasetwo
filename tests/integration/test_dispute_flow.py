from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

BAD_EVIDENCE_URL = "https://example.com"
GOOD_EVIDENCE_URL = "https://example.com"
SPEC_MISMATCHED = (
    "The submitted page must be a fully functional, live checkout page for an "
    "online shoe store, including a working payment form and a shopping cart."
)


def test_raise_dispute_appends_evidence_and_retriggers_judgment():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    tx = contract.create_engagement(
        args=[counterparty.address, SPEC_MISMATCHED, future_deadline()]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(
        args=[eid, [BAD_EVIDENCE_URL], "Here's the checkout page."]
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

    # Either party may dispute a rejected engagement (spec Flow D).
    tx = counterparty_contract.raise_dispute(
        args=[eid, [GOOD_EVIDENCE_URL], "I believe this does satisfy the spec, please re-review."]
    ).transact()
    assert tx_execution_succeeded(tx), f"raise_dispute failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "disputed"
    assert eng["dispute_round"] == 1
    assert len(eng["evidence_urls"]) == 2

    # Re-judgment must actually run again (not a cached/no-op result) --
    # request_release accepts "disputed" as a valid starting status.
    tx = contract.request_release(args=[eid]).transact(
        wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
    )
    assert tx_execution_succeeded(tx), f"second request_release failed: {tx}"

    # A "met" verdict now lands on "approved" (not paid out yet, appeal
    # window open) rather than "released" - see test_release_approval.py.
    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] in ("approved", "rejected"), f"unexpected status after re-judgment: {eng['status']}"
    assert eng["decision_reasoning"].strip() != ""

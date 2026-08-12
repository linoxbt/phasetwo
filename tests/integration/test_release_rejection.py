from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

# Same stable, predictable evidence page as the approval test, but paired with
# a spec it obviously does not satisfy -- unambiguous enough for a small
# local model to reliably reject.
EVIDENCE_URL = "https://example.com"
SPEC_MISMATCHED = (
    "The submitted page must be a fully functional, live checkout page for an "
    "online shoe store, including a working payment form and a shopping cart."
)


def test_request_release_rejects_mismatched_evidence():
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
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"expected rejected, got {eng['status']}: {eng['decision_reasoning']}"
    assert eng["decision_reasoning"].strip() != ""
    assert eng["funds_released"] is False

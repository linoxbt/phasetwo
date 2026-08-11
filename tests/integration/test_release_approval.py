from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

# example.com is IANA's stable reserved-example page; its content essentially
# never changes, so this is as close to a guaranteed-correct judgment as a
# live web fetch can get -- important given the local validator is a small
# 1.5B model rather than a frontier one.
EVIDENCE_URL = "https://example.com"
SPEC_MATCHING = (
    "The submitted page must be IANA's reserved example domain page, and its "
    "body text must contain the exact phrase 'documentation examples'."
)


def test_request_release_approves_matching_evidence():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    tx = contract.create_engagement(
        args=[counterparty.address, SPEC_MATCHING, future_deadline()]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1  # first engagement created against a freshly deployed contract

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(
        args=[eid, [EVIDENCE_URL], "See the live page, it's the standard IANA example page."]
    ).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(
        wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
    )
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    # A "met" verdict opens the same appeal window a rejection does - it
    # doesn't pay out on the spot. See test_settle_approved_integration.py
    # for the full approve -> window elapses -> settle_approved -> released
    # path, and its redirect-during-dispute test for the economic guarantee
    # this exists to provide.
    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "approved", f"expected approved, got {eng['status']}: {eng['decision_reasoning']}"
    assert eng["decision_reasoning"].strip() != ""
    assert eng["funds_released"] is False
    assert eng["approved_at"] != 0

from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline, JUDGE_WAIT_RETRIES, JUDGE_WAIT_INTERVAL

# Same stable, obviously-matching pair used by test_release_approval.py -
# reliably reaches "met" with a small local model, so a hash mismatch is the
# only thing standing between this submission and an "approved" verdict.
EVIDENCE_URL = "https://example.com"
SPEC_MATCHING = (
    "The submitted page must be IANA's reserved example domain page, and its "
    "body text must contain the exact phrase 'documentation examples'."
)

# Well-formed but deliberately wrong - genuinely mismatches whatever content
# request_release actually fetches, regardless of what that content is.
WRONG_HASH = "b" * 64


def test_request_release_deterministically_rejects_a_hash_mismatch():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    tx = contract.create_engagement(
        args=[counterparty.address, SPEC_MATCHING, future_deadline(), 0, EVIDENCE_URL]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    # Committing to a hash that doesn't match the real page content is exactly
    # the tamper scenario request_release's judge() has to catch - the point
    # of this test isn't that the URL is wrong, it's that the committed bytes
    # no longer match what's live at judgment time.
    tx = counterparty_contract.submit_deliverable(
        args=[eid, [EVIDENCE_URL], [WRONG_HASH], "See the live page."]
    ).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(
        wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
    )
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    # This must be deterministic - the hash check short-circuits before the
    # LLM is ever called, so every validator reaches the same "not met"
    # verdict without needing to agree on anything about the page's content.
    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"expected rejected, got {eng['status']}: {eng['decision_reasoning']}"
    assert EVIDENCE_URL in eng["decision_reasoning"]
    assert "hash" in eng["decision_reasoning"].lower()
    assert eng["funds_released"] is False

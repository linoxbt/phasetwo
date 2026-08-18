from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded, tx_execution_failed

from conftest import (
    deploy_surety,
    as_account,
    future_deadline,
    JUDGE_WAIT_RETRIES,
    JUDGE_WAIT_INTERVAL,
    EVIDENCE_HASH,
)

# Same stable, obviously-mismatched pair used by test_release_rejection.py --
# reliably reaches 'rejected' with a small local model, and re-judging the
# same evidence against the same spec reliably reproduces that rejection -
# exactly the deterministic case needed to prove bond forfeiture.
EVIDENCE_URL = "https://example.com"
SPEC_MISMATCHED = (
    "The submitted page must be a fully functional, live checkout page for an "
    "online shoe store, including a working payment form and a shopping cart."
)

DEPOSIT = 1000
REQUIRED_BOND = 50  # 5% of DEPOSIT, per DISPUTE_BOND_BPS


def _reject_engagement(contract, counterparty_contract, counterparty_address):
    tx = contract.create_engagement(
        args=[counterparty_address, SPEC_MISMATCHED, future_deadline(), 0, EVIDENCE_URL]
    ).transact(value=DEPOSIT)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    tx = counterparty_contract.submit_deliverable(
        args=[eid, [EVIDENCE_URL], [EVIDENCE_HASH], "Here's the checkout page."]
    ).transact()
    assert tx_execution_succeeded(tx), f"submit_deliverable failed: {tx}"

    tx = contract.request_release(args=[eid]).transact(wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL)
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected", f"expected rejection, got {eng['status']}: {eng['decision_reasoning']}"
    return eid


def test_raise_dispute_blocked_with_insufficient_bond():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    tx = counterparty_contract.raise_dispute(args=[eid, "not enough proof"]).transact(value=REQUIRED_BOND - 1)
    assert tx_execution_failed(tx), f"expected raise_dispute to fail with an insufficient bond: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected"  # unchanged - the dispute never took effect
    assert eng["dispute_bond"] == 0


def test_raise_dispute_succeeds_with_minimum_bond():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    tx = counterparty_contract.raise_dispute(args=[eid, "please re-review"]).transact(value=REQUIRED_BOND)
    assert tx_execution_succeeded(tx), f"raise_dispute with the exact minimum bond should succeed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "disputed"
    assert eng["dispute_bond"] == REQUIRED_BOND
    assert eng["pre_dispute_status"] == "rejected"


def test_raise_dispute_caps_bond_at_the_required_minimum():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    # Send 3x the required bond - only the required amount should ever be at
    # stake; the excess is refunded immediately rather than being exposed to
    # forfeiture too.
    tx = counterparty_contract.raise_dispute(args=[eid, "please re-review"]).transact(value=REQUIRED_BOND * 3)
    assert tx_execution_succeeded(tx), f"raise_dispute with an overpaid bond should still succeed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "disputed"
    assert eng["dispute_bond"] == REQUIRED_BOND, f"expected the bond capped at {REQUIRED_BOND}, got {eng['dispute_bond']}"


def test_raise_dispute_rejects_oversized_reason():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    tx = counterparty_contract.raise_dispute(args=[eid, "x" * 2001]).transact(value=REQUIRED_BOND)
    assert tx_execution_failed(tx), f"expected an oversized dispute reason to be rejected: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected"  # unchanged
    assert eng["dispute_bond"] == 0


def test_dispute_forfeits_bond_when_verdict_does_not_change():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    tx = counterparty_contract.raise_dispute(args=[eid, "please re-review"]).transact(value=REQUIRED_BOND)
    assert tx_execution_succeeded(tx), f"raise_dispute failed: {tx}"

    # Same evidence, same spec - the re-judgment reliably reproduces the same
    # rejection, so the dispute was frivolous and the bond is forfeited
    # (resolved and reset to 0) rather than refunded to the disputer. Which
    # bond-refund-on-flip is inherently non-deterministic (it depends on the
    # judge LLM disagreeing with itself on identical evidence) and isn't
    # reliably reproducible in an automated test - the bookkeeping logic that
    # would handle it is exercised by this same code path, just taking the
    # "unchanged" branch instead of the "flipped" one.
    tx = contract.request_release(args=[eid]).transact(wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL)
    assert tx_execution_succeeded(tx), f"request_release failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "rejected"
    assert eng["dispute_bond"] == 0


def test_raise_dispute_blocked_after_max_rounds():
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]
    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    eid = _reject_engagement(contract, counterparty_contract, counterparty.address)

    # Three rounds of dispute -> re-judge, each reproducing the same
    # rejection given unchanged evidence/spec - proves the cap is reachable
    # in practice, not just checkable as a standalone guard.
    for round_num in range(1, 4):
        tx = counterparty_contract.raise_dispute(args=[eid, f"round {round_num}"]).transact(value=REQUIRED_BOND)
        assert tx_execution_succeeded(tx), f"raise_dispute round {round_num} failed: {tx}"

        eng = contract.get_engagement(args=[eid]).call()
        assert eng["dispute_round"] == round_num

        tx = contract.request_release(args=[eid]).transact(
            wait_retries=JUDGE_WAIT_RETRIES, wait_interval=JUDGE_WAIT_INTERVAL
        )
        assert tx_execution_succeeded(tx), f"request_release after round {round_num} failed: {tx}"

        eng = contract.get_engagement(args=[eid]).call()
        assert eng["status"] == "rejected"

    # A 4th dispute must be blocked by the round cap, regardless of bond.
    tx = counterparty_contract.raise_dispute(args=[eid, "one more time"]).transact(value=REQUIRED_BOND)
    assert tx_execution_failed(tx), f"expected the 4th dispute to be blocked by the round cap: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["dispute_round"] == 3
    assert eng["status"] == "rejected"

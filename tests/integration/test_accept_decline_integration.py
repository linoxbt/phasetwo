import time

from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, as_account, future_deadline


def test_refund_expired_after_acceptance_but_no_submission():
    """Covers what direct mode couldn't: refund_expired's widened guard now
    accepting ACCEPTED (not just CREATED), proven against a real elapsed
    deadline - the counterparty accepts, then simply never delivers."""
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)
    counterparty_contract = as_account(contract, counterparty)

    deadline = future_deadline(seconds=5)
    tx = contract.create_engagement(args=[counterparty.address, "Ship it", deadline]).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    tx = counterparty_contract.accept_engagement(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"accept_engagement failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "accepted"

    time.sleep(8)  # let the 5-second deadline actually pass

    tx = contract.refund_expired(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"refund_expired failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "expired"
    assert eng["funds_released"] is True

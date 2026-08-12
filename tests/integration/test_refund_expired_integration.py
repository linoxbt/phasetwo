import time

from gltest import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import deploy_surety, future_deadline


def test_refund_expired_after_real_deadline_passes():
    """Covers what direct mode couldn't: an actual elapsed deadline, using
    GenVM's real per-transaction clock rather than a mocked one (see the NOTE
    in tests/direct/test_refund_expired.py for why direct mode can't do this)."""
    accounts = get_accounts()
    depositor, counterparty = accounts[0], accounts[1]

    contract = deploy_surety(account=depositor)

    deadline = future_deadline(seconds=5)
    tx = contract.create_engagement(
        args=[counterparty.address, "Ship it", deadline, 0, "https://example.com"]
    ).transact(value=1000)
    assert tx_execution_succeeded(tx), f"create_engagement failed: {tx}"

    eid = 1

    time.sleep(8)  # let the 5-second deadline actually pass

    tx = contract.refund_expired(args=[eid]).transact()
    assert tx_execution_succeeded(tx), f"refund_expired failed: {tx}"

    eng = contract.get_engagement(args=[eid]).call()
    assert eng["status"] == "expired"
    assert eng["funds_released"] is True

    # Second refund must be blocked -- funds already moved once.
    tx = contract.refund_expired(args=[eid]).transact()
    assert not tx_execution_succeeded(tx), "double refund should have failed"

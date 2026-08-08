from conftest import deploy_surety, future_deadline


def _create(contract, direct_vm, depositor, counterparty, deadline_days=1):
    direct_vm.sender = depositor
    direct_vm.value = 1000
    eid = contract.create_engagement(counterparty, "Ship it", future_deadline(deadline_days))
    direct_vm.value = 0
    return eid


# NOTE: the happy-path ("deadline actually passed -> refund succeeds") and
# double-refund-blocked cases can't be exercised in direct mode with this
# version of gltest: warp() updates vm._datetime, but the direct-mode
# harness's _refresh_gl_message() (gltest/direct/vm.py) only patches
# gl.message_raw's sender_address/origin_address on later calls, not
# datetime -- message_raw['datetime'] is injected once at direct_deploy()
# time and frozen for the rest of the test process. The contract itself
# correctly reads gl.message_raw['datetime'] (verified against the real
# GenVM SDK source), so this is a test-tool gap, not a contract bug.
# Covered instead by integration tests against the running localnet.


def test_refund_expired_blocks_before_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob, deadline_days=7)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Deadline has not passed yet"):
        contract.refund_expired(eid)


def test_refund_expired_allows_accepted_status_through_to_deadline_check(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    # Widened to cover ACCEPTED (not just CREATED) so a depositor can still
    # be refunded if the counterparty accepted but never delivered - confirm
    # the status guard itself no longer rejects 'accepted' (falls through to
    # the deadline check instead, same as it already does for 'created').
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob, deadline_days=7)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Deadline has not passed yet"):
        contract.refund_expired(eid)


def test_refund_expired_blocks_after_submission(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob, deadline_days=1)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)
    contract.submit_deliverable(eid, ["https://example.com"], "notes")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Can only refund an expired engagement with no submission"):
        contract.refund_expired(eid)



from conftest import deploy_surety, future_deadline


def _create(contract, direct_vm, depositor, counterparty, spec="Ship it"):
    direct_vm.sender = depositor
    direct_vm.value = 1000
    eid = contract.create_engagement(counterparty, spec, future_deadline())
    direct_vm.value = 0
    return eid


def test_raise_dispute_only_parties(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the depositor or counterparty may dispute"):
        contract.raise_dispute(eid, [], "not happy")


def test_raise_dispute_requires_terminal_status(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    # Still status=created here — raise_dispute is only valid from rejected/released,
    # which are only reachable via request_release's LLM judgment (integration tests).
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot dispute in status 'created'"):
        contract.raise_dispute(eid, [], "not happy")


def test_raise_dispute_requires_terminal_status_after_submission(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)
    contract.submit_deliverable(eid, ["https://example.com"], "notes")

    # The empty-reason guard sits behind the status check, so it can only be
    # exercised once status is rejected/released — reachable only via
    # request_release's LLM judgment. Covered by integration tests instead.
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot dispute in status 'submitted'"):
        contract.raise_dispute(eid, [], "still not happy")

from conftest import deploy_surety, future_deadline


def _create(contract, direct_vm, depositor, counterparty, spec="Ship it"):
    direct_vm.sender = depositor
    direct_vm.value = 1000
    eid = contract.create_engagement(counterparty, spec, future_deadline())
    direct_vm.value = 0
    return eid


# NOTE: settle_approved's window-open/window-elapsed happy paths require an
# engagement to actually reach 'approved' (only reachable via request_release's
# LLM judgment) AND require real elapsed wall-clock time between the approval
# and the settle call - direct mode's simulated clock is frozen once at
# direct_deploy() time for the whole test process (same limitation documented
# in tests/direct/test_settle_rejected.py). Covered instead by
# tests/integration/test_settle_approved_integration.py, which deploys with a
# short appeal_window_seconds and uses real time.sleep().


def test_settle_approved_blocks_from_created(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot settle in status 'created'"):
        contract.settle_approved(eid)


def test_settle_approved_blocks_from_submitted(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)
    contract.submit_deliverable(eid, ["https://example.com"], "notes")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot settle in status 'submitted'"):
        contract.settle_approved(eid)


def test_settle_approved_is_permissionless_but_still_status_gated(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    # Anyone may call settle_approved (matches settle_rejected's permission
    # model) - but the status guard still applies regardless of caller.
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Cannot settle in status 'created'"):
        contract.settle_approved(eid)


def test_get_engagement_exposes_approved_at(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    eng = contract.get_engagement(eid)
    assert eng["approved_at"] == 0

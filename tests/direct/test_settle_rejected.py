from conftest import deploy_surety, create_engagement as _create


# NOTE: settle_rejected's window-open/window-elapsed happy paths require an
# engagement to actually reach 'rejected' (only reachable via request_release's
# LLM judgment) AND require real elapsed wall-clock time between the rejection
# and the settle call. Direct mode's simulated clock is frozen once at
# direct_deploy() time for the whole test process (see the NOTE in
# tests/direct/test_refund_expired.py for the same limitation applied to
# refund_expired's deadline check) - so `_now()` never advances between two
# calls in the same test, and the window-elapsed branch can never be reached
# here. Covered instead by tests/integration/test_settle_rejected_integration.py,
# which deploys with a short `appeal_window_seconds` and uses real time.sleep(),
# the same pattern test_refund_expired_integration.py already uses for the
# deadline check.


def test_settle_rejected_blocks_from_created(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot settle in status 'created'"):
        contract.settle_rejected(eid)


def test_settle_rejected_blocks_from_submitted(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)
    contract.submit_deliverable(eid, ["https://example.com"], "notes")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Cannot settle in status 'submitted'"):
        contract.settle_rejected(eid)


def test_settle_rejected_is_permissionless_but_still_status_gated(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    # Anyone may call settle_rejected (matches refund_expired's permission
    # model) - but the status guard still applies regardless of caller.
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Cannot settle in status 'created'"):
        contract.settle_rejected(eid)


def test_get_engagement_exposes_rejected_at(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    eng = contract.get_engagement(eid)
    assert eng["rejected_at"] == 0


def test_get_appeal_window_seconds_default(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    assert contract.get_appeal_window_seconds() == 3 * 24 * 60 * 60


def test_appeal_window_seconds_is_configurable_at_deploy(direct_vm, direct_deploy):
    direct_vm.warp("2026-01-01T00:00:00Z")
    contract = direct_deploy("contracts/surety.py", appeal_window_seconds=5)
    assert contract.get_appeal_window_seconds() == 5

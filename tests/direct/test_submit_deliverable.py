from conftest import deploy_surety, future_deadline, create_engagement as _create

# NOTE: "submit after the deadline is blocked" can't be exercised in direct
# mode - same gltest harness gap documented in test_refund_expired.py
# (warp() doesn't propagate into message_raw['datetime'] for calls after
# direct_deploy()). Covered instead by integration tests against a running
# network, where wall-clock time actually advances.


def _accept(contract, direct_vm, counterparty, eid):
    direct_vm.sender = counterparty
    contract.accept_engagement(eid)


def test_submit_deliverable_success(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    contract.submit_deliverable(eid, ["https://example.com/repo"], "done, see repo")

    eng = contract.get_engagement(eid)
    assert eng["status"] == "submitted"
    assert eng["notes"] == "done, see repo"
    assert list(eng["evidence_urls"]) == ["https://example.com/repo"]


def test_submit_deliverable_only_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the counterparty may submit a deliverable"):
        contract.submit_deliverable(eid, ["https://example.com"], "notes")


def test_submit_deliverable_requires_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("At least one evidence URL is required"):
        contract.submit_deliverable(eid, [], "no proof")


def test_submit_deliverable_blocks_before_acceptance(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot submit in status 'created'"):
        contract.submit_deliverable(eid, ["https://example.com"], "too soon")


def test_submit_deliverable_blocks_resubmission(direct_vm, direct_deploy, direct_alice, direct_bob):
    # One shot only: further evidence after a first submission goes through
    # raise_dispute's additional_evidence, not a second submit_deliverable.
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    contract.submit_deliverable(eid, ["https://example.com/v1"], "v1")

    with direct_vm.expect_revert("Cannot submit in status 'submitted'"):
        contract.submit_deliverable(eid, ["https://example.com/v2"], "v2")

    eng = contract.get_engagement(eid)
    assert eng["notes"] == "v1"
    assert list(eng["evidence_urls"]) == ["https://example.com/v1"]


def test_submit_deliverable_caps_url_count(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    too_many = [f"https://example.com/{i}" for i in range(11)]
    with direct_vm.expect_revert("Too many evidence URLs"):
        contract.submit_deliverable(eid, too_many, "notes")


def test_submit_deliverable_enforces_bound_evidence_prefix(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    eid = contract.create_engagement(
        direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="https://github.com/example/repo"
    )
    direct_vm.value = 0
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not match the prefix committed to at creation"):
        contract.submit_deliverable(eid, ["https://evil.example.com/fake"], "not the real repo")

    # A URL that does match the bound prefix still goes through normally.
    contract.submit_deliverable(eid, ["https://github.com/example/repo/pull/1"], "see the PR")
    eng = contract.get_engagement(eid)
    assert eng["status"] == "submitted"
    assert eng["allowed_evidence_prefix"] == "https://github.com/example/repo"

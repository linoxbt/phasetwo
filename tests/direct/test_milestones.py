from conftest import deploy_surety, future_deadline


def _create(contract, direct_vm, depositor, counterparty, spec="Milestone", parent_id=0):
    direct_vm.sender = depositor
    direct_vm.value = 1000
    eid = contract.create_engagement(counterparty, spec, future_deadline(), parent_id=parent_id)
    direct_vm.value = 0
    return eid


def test_create_engagement_defaults_to_standalone(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    eng = contract.get_engagement(eid)
    assert eng["parent_id"] == 0


def test_create_milestone_links_to_root(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    root_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 1")
    milestone_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 2", parent_id=root_id)

    eng = contract.get_engagement(milestone_id)
    assert eng["parent_id"] == root_id
    # Each milestone is otherwise an ordinary, fully independent engagement.
    assert eng["status"] == "created"


def test_create_milestone_rejects_mismatched_depositor(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    root_id = _create(contract, direct_vm, direct_alice, direct_bob)

    with direct_vm.expect_revert("parent_id must be an engagement between the same depositor and counterparty"):
        _create(contract, direct_vm, direct_charlie, direct_bob, parent_id=root_id)


def test_create_milestone_rejects_mismatched_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    root_id = _create(contract, direct_vm, direct_alice, direct_bob)

    with direct_vm.expect_revert("parent_id must be an engagement between the same depositor and counterparty"):
        _create(contract, direct_vm, direct_alice, direct_charlie, parent_id=root_id)


def test_create_milestone_rejects_nonroot_parent(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    root_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 1")
    milestone_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 2", parent_id=root_id)

    with direct_vm.expect_revert("parent_id must point at a root engagement, not another milestone"):
        _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 3", parent_id=milestone_id)


def test_create_milestone_rejects_nonexistent_parent(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)

    with direct_vm.expect_revert("Engagement 999 does not exist"):
        _create(contract, direct_vm, direct_alice, direct_bob, parent_id=999)


def test_milestones_are_fully_independent_lifecycles(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    root_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 1")
    milestone_id = _create(contract, direct_vm, direct_alice, direct_bob, spec="Milestone 2", parent_id=root_id)

    direct_vm.sender = direct_bob
    contract.accept_engagement(root_id)

    # The sibling milestone is untouched by accepting the root.
    sibling = contract.get_engagement(milestone_id)
    assert sibling["status"] == "created"

    direct_vm.sender = direct_bob
    contract.decline_engagement(milestone_id, "not this one yet")

    root = contract.get_engagement(root_id)
    assert root["status"] == "accepted"

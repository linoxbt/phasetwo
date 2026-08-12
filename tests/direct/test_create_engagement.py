from conftest import deploy_surety, future_deadline


def test_create_engagement_success(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    eid = contract.create_engagement(
        direct_bob, "Ship a working login page", future_deadline(), allowed_evidence_prefix="https://example.com"
    )

    # SDK path is only set up once direct_deploy() runs, so import Address here
    # rather than at module level (matches how gltest's own create_address()
    # fixture has to do this same lazy import).
    from genlayer.py.types import Address

    eng = contract.get_engagement(eid)
    assert eng["depositor"] == Address(direct_alice)
    assert eng["counterparty"] == Address(direct_bob)
    assert eng["amount"] == 1000
    assert eng["status"] == "created"
    assert eng["dispute_round"] == 0
    assert eng["funds_released"] is False


def test_create_engagement_requires_value(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 0

    with direct_vm.expect_revert("Deposit value must be greater than zero"):
        contract.create_engagement(direct_bob, "Ship it", future_deadline())


def test_create_engagement_requires_future_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    with direct_vm.expect_revert("deadline must be in the future"):
        contract.create_engagement(direct_bob, "Ship it", future_deadline(days=-1))


def test_create_engagement_requires_nonempty_spec(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    with direct_vm.expect_revert("deliverable_spec must not be empty"):
        contract.create_engagement(direct_bob, "   ", future_deadline())


def test_create_engagement_rejects_self_engagement(direct_vm, direct_deploy, direct_alice):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    with direct_vm.expect_revert("counterparty must differ from depositor"):
        contract.create_engagement(direct_alice, "Ship it", future_deadline())


def test_create_engagement_ids_increment(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    id1 = contract.create_engagement(direct_bob, "First", future_deadline(), allowed_evidence_prefix="https://example.com")
    id2 = contract.create_engagement(direct_bob, "Second", future_deadline(), allowed_evidence_prefix="https://example.com")

    assert id2 == id1 + 1


def test_create_engagement_rejects_oversized_spec(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    with direct_vm.expect_revert("deliverable_spec too long"):
        contract.create_engagement(direct_bob, "x" * 8001, future_deadline())


def test_create_engagement_requires_evidence_prefix(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000

    with direct_vm.expect_revert("allowed_evidence_prefix is required"):
        contract.create_engagement(direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="")

    with direct_vm.expect_revert("allowed_evidence_prefix is required"):
        contract.create_engagement(direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="   ")

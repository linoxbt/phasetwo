from conftest import deploy_surety, future_deadline


def _create(contract, direct_vm, depositor, counterparty, spec="Ship it"):
    direct_vm.sender = depositor
    direct_vm.value = 1000
    eid = contract.create_engagement(counterparty, spec, future_deadline())
    direct_vm.value = 0
    return eid


def test_accept_engagement_success(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)

    eng = contract.get_engagement(eid)
    assert eng["status"] == "accepted"
    assert eng["funds_released"] is False


def test_accept_engagement_only_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the counterparty may accept"):
        contract.accept_engagement(eid)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the counterparty may accept"):
        contract.accept_engagement(eid)


def test_accept_engagement_blocks_once_already_accepted(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)

    with direct_vm.expect_revert("Cannot accept in status 'accepted'"):
        contract.accept_engagement(eid)


def test_decline_engagement_refunds_depositor(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.decline_engagement(eid, "not my area of expertise")

    eng = contract.get_engagement(eid)
    assert eng["status"] == "declined"
    assert eng["funds_released"] is True
    assert eng["notes"] == "not my area of expertise"


def test_decline_engagement_only_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the counterparty may decline"):
        contract.decline_engagement(eid, "not me")


def test_decline_engagement_requires_reason(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("A reason is required to decline"):
        contract.decline_engagement(eid, "   ")


def test_decline_engagement_blocks_once_accepted(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.accept_engagement(eid)

    with direct_vm.expect_revert("Cannot decline in status 'accepted'"):
        contract.decline_engagement(eid, "changed my mind")


def test_submit_deliverable_blocks_before_acceptance_via_decline_path(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    contract.decline_engagement(eid, "no thanks")

    with direct_vm.expect_revert("Cannot submit in status 'declined'"):
        contract.submit_deliverable(eid, ["https://example.com"], "notes")


def test_register_and_get_pubkey(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)

    direct_vm.sender = direct_alice
    contract.register_pubkey("alice-pubkey-base64")

    direct_vm.sender = direct_bob
    contract.register_pubkey("bob-pubkey-base64")

    assert contract.get_pubkey(direct_alice) == "alice-pubkey-base64"
    assert contract.get_pubkey(direct_bob) == "bob-pubkey-base64"


def test_get_pubkey_unregistered_returns_empty(direct_vm, direct_deploy, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    assert contract.get_pubkey(direct_charlie) == ""


def test_register_pubkey_requires_nonempty(direct_vm, direct_deploy, direct_alice):
    contract = deploy_surety(direct_vm, direct_deploy)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("pubkey must not be empty"):
        contract.register_pubkey("   ")


def test_register_pubkey_overwrites_previous(direct_vm, direct_deploy, direct_alice):
    contract = deploy_surety(direct_vm, direct_deploy)

    direct_vm.sender = direct_alice
    contract.register_pubkey("first-key")
    contract.register_pubkey("second-key")

    assert contract.get_pubkey(direct_alice) == "second-key"

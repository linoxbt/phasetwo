from conftest import deploy_surety, future_deadline


def test_get_engagement_missing_id_reverts(direct_vm, direct_deploy, direct_alice):
    contract = deploy_surety(direct_vm, direct_deploy)
    with direct_vm.expect_revert("does not exist"):
        contract.get_engagement(999)


def test_list_engagements_for_depositor_and_counterparty(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = deploy_surety(direct_vm, direct_deploy)

    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    id1 = contract.create_engagement(direct_bob, "First", future_deadline(), allowed_evidence_prefix="https://example.com")
    id2 = contract.create_engagement(direct_charlie, "Second", future_deadline(), allowed_evidence_prefix="https://example.com")
    direct_vm.value = 0

    direct_vm.sender = direct_charlie
    direct_vm.value = 500
    id3 = contract.create_engagement(direct_bob, "Third", future_deadline(), allowed_evidence_prefix="https://example.com")
    direct_vm.value = 0

    alice_ids = set(contract.list_engagements_for(direct_alice))
    bob_ids = set(contract.list_engagements_for(direct_bob))
    charlie_ids = set(contract.list_engagements_for(direct_charlie))

    assert alice_ids == {id1, id2}
    assert bob_ids == {id1, id3}
    assert charlie_ids == {id2, id3}


def test_list_all_ids(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)

    assert contract.list_all_ids() == []

    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    id1 = contract.create_engagement(direct_bob, "First", future_deadline(), allowed_evidence_prefix="https://example.com")

    direct_vm.sender = direct_charlie
    direct_vm.value = 500
    id2 = contract.create_engagement(direct_bob, "Second", future_deadline(), allowed_evidence_prefix="https://example.com")
    direct_vm.value = 0

    assert set(contract.list_all_ids()) == {id1, id2}

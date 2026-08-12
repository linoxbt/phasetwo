from conftest import deploy_surety, create_engagement as _create


def test_add_comment_by_depositor_and_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    contract.add_comment(eid, "Any update on this?")

    direct_vm.sender = direct_bob
    contract.add_comment(eid, "Working on it, will submit by Friday.")

    eng = contract.get_engagement(eid)
    comments = eng["comments"]
    assert len(comments) == 2
    assert comments[0]["text"] == "Any update on this?"
    assert comments[1]["text"] == "Working on it, will submit by Friday."


def test_add_comment_only_parties(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the depositor or counterparty may comment"):
        contract.add_comment(eid, "Not my business, but...")


def test_add_comment_requires_nonempty_text(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Comment text must not be empty"):
        contract.add_comment(eid, "   ")


def test_add_comment_enforces_max_length(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Comment too long"):
        contract.add_comment(eid, "x" * 2001)

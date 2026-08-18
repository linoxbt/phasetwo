from conftest import deploy_surety, future_deadline, create_engagement as _create, DUMMY_HASH

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
    contract.submit_deliverable(eid, ["https://example.com/repo"], [DUMMY_HASH], "done, see repo")

    eng = contract.get_engagement(eid)
    assert eng["status"] == "submitted"
    assert eng["notes"] == "done, see repo"
    assert list(eng["evidence_urls"]) == ["https://example.com/repo"]
    assert list(eng["evidence_hashes"]) == [DUMMY_HASH]


def test_submit_deliverable_only_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the counterparty may submit a deliverable"):
        contract.submit_deliverable(eid, ["https://example.com"], [DUMMY_HASH], "notes")


def test_submit_deliverable_requires_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("At least one evidence URL is required"):
        contract.submit_deliverable(eid, [], [], "no proof")


def test_submit_deliverable_blocks_before_acceptance(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Cannot submit in status 'created'"):
        contract.submit_deliverable(eid, ["https://example.com"], [DUMMY_HASH], "too soon")


def test_submit_deliverable_blocks_resubmission(direct_vm, direct_deploy, direct_alice, direct_bob):
    # One shot only: further evidence after a first submission goes through
    # raise_dispute, which no longer accepts new evidence at all - it can
    # only contest the evidence already locked in here.
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    contract.submit_deliverable(eid, ["https://example.com/v1"], [DUMMY_HASH], "v1")

    with direct_vm.expect_revert("Cannot submit in status 'submitted'"):
        contract.submit_deliverable(eid, ["https://example.com/v2"], [DUMMY_HASH], "v2")

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
        contract.submit_deliverable(eid, too_many, [DUMMY_HASH] * 11, "notes")


def test_submit_deliverable_enforces_bound_evidence_host(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    eid = contract.create_engagement(
        direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="https://github.com/example/repo"
    )
    direct_vm.value = 0
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not match the scheme/host committed to at creation"):
        contract.submit_deliverable(eid, ["https://evil.example.com/fake"], [DUMMY_HASH], "not the real repo")

    # A URL that does match the bound prefix still goes through normally.
    contract.submit_deliverable(eid, ["https://github.com/example/repo/pull/1"], [DUMMY_HASH], "see the PR")
    eng = contract.get_engagement(eid)
    assert eng["status"] == "submitted"
    assert eng["allowed_evidence_prefix"] == "https://github.com/example/repo"


def test_submit_deliverable_rejects_path_prefix_confusion(direct_vm, direct_deploy, direct_alice, direct_bob):
    # A raw string .startswith() check would wrongly let "example-evil"
    # through here, since "https://github.com/example-evil/x" genuinely
    # starts with the string "https://github.com/example". Real path-segment
    # validation must reject it - the bound path has to match on a "/"
    # boundary, not an arbitrary substring.
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    eid = contract.create_engagement(
        direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="https://github.com/example"
    )
    direct_vm.value = 0
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not match the path committed to at creation"):
        contract.submit_deliverable(eid, ["https://github.com/example-evil/x"], [DUMMY_HASH], "nice try")


def test_submit_deliverable_rejects_host_suffix_confusion(direct_vm, direct_deploy, direct_alice, direct_bob):
    # Same class of bug, on the host: a raw .startswith() check on
    # "https://github.com" would wrongly match "https://github.com.attacker.io/x",
    # since that string does start with "https://github.com" even though the
    # real host is a completely different domain. Parsed host comparison
    # must reject it.
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    eid = contract.create_engagement(
        direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix="https://github.com"
    )
    direct_vm.value = 0
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not match the scheme/host committed to at creation"):
        contract.submit_deliverable(eid, ["https://github.com.attacker.io/x"], [DUMMY_HASH], "nice try")


def test_submit_deliverable_requires_hash_for_mutable_evidence(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("A content hash is required"):
        contract.submit_deliverable(eid, ["https://example.com"], [""], "no hash")


def test_submit_deliverable_rejects_malformed_hash(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("is not a valid sha256 hash"):
        contract.submit_deliverable(eid, ["https://example.com"], ["not-a-hash"], "bad hash")


def test_submit_deliverable_requires_matching_hash_count(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy_surety(direct_vm, direct_deploy)
    eid = _create(contract, direct_vm, direct_alice, direct_bob)
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("evidence_hashes must have exactly one entry per evidence URL"):
        contract.submit_deliverable(eid, ["https://example.com"], [], "missing hash entry")


def test_submit_deliverable_allows_empty_hash_for_content_addressed_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = deploy_surety(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    # The host is matched exactly (not prefix-matched), so binding to a CID
    # means binding to that exact CID - fitting for content-addressed evidence,
    # where the identifier already *is* the content commitment.
    cid = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    eid = contract.create_engagement(
        direct_bob, "Ship it", future_deadline(), allowed_evidence_prefix=cid
    )
    direct_vm.value = 0
    _accept(contract, direct_vm, direct_bob, eid)

    direct_vm.sender = direct_bob
    # No hash needed - the CID itself is a content hash, already immutable.
    contract.submit_deliverable(eid, [cid], [""], "on ipfs")
    eng = contract.get_engagement(eid)
    assert eng["status"] == "submitted"
    assert list(eng["evidence_hashes"]) == [""]

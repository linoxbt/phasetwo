import time

from gltest import get_contract_factory
from gltest.contracts import Contract

CONTRACT_NAME = "Surety"

# sha256 of https://example.com's content as GenVM's gl.nondet.web.render(url,
# mode="text") returns it. Computed once against a live GenVM node and
# hardcoded here since the page's content is stable (IANA's reserved example
# domain) - see request_release's judge() in contracts/surety.py for the
# verification this has to match.
#
# NOTE: this value could not be re-verified against a live node in the
# environment this round of fixes was written in (the local GenVM simulator's
# jsonrpc container was down - unrelated to the contract change, confirmed via
# a baseline regression check against the already-deployed, already-proven
# contract, which failed identically). If these tests fail on a mismatch, the
# first thing to check is whether this constant is actually correct - not
# whether the hash-binding feature itself is broken.
EVIDENCE_HASH = "d003f90bc10db991b76e6fb480123cfce2cbb2b2784abe687fccccfa7ecacad8"

# request_release runs LLM judgment across 5 local validators (qwen2.5:1.5b on
# CPU) -- give it much more time than the default wait budget.
JUDGE_WAIT_RETRIES = 120
JUDGE_WAIT_INTERVAL = 3000


def deploy_surety(account=None, args=None):
    factory = get_contract_factory(CONTRACT_NAME)
    return factory.deploy(account=account, args=args)


def as_account(contract: Contract, account) -> Contract:
    """Rebind an already-deployed contract to a different calling account,
    reusing the already-fetched schema instead of a fresh network round trip."""
    return Contract.new(address=contract.address, schema=contract._schema, account=account)


def future_deadline(seconds: int = 7 * 24 * 3600) -> int:
    return int(time.time()) + seconds

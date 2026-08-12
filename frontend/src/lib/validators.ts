import { NETWORKS, type NetworkKey } from './network'

/**
 * The number of validators GenLayer's consensus uses per verdict on a given
 * network. This is a protocol-configured parameter, not something that
 * varies transaction-to-transaction - so there's no "recent transaction" to
 * look up. Sourced directly from genlayer-js's own chain definition (not
 * hardcoded here), so it stays correct automatically across genlayer-js
 * upgrades instead of needing a manually-maintained reference value.
 *
 * (An earlier version of this tried to read a live per-transaction
 * validator count by scanning recent chain transactions - dropped after
 * confirming that approach was unreliable: GenLayer transactions don't
 * consistently populate the standard EVM blockNumber that log-range
 * scanning depends on, and the "live" figure it produced fell back to this
 * exact same static value in practice anyway.)
 */
export function getValidatorCount(network: NetworkKey): number {
  return NETWORKS[network].chain.defaultNumberOfInitialValidators
}

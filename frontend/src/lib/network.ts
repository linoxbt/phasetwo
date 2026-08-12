import { useSyncExternalStore } from 'react'
import { studionet, testnetAsimov } from 'genlayer-js/chains'

// Localnet intentionally excluded - the app targets GenLayer's real networks
// only, so a wallet's "add network" prompt never offers a local dev chain.
export const NETWORKS = {
  testnetAsimov: {
    chain: testnetAsimov,
    label: 'Asimov Testnet',
    contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS_ASIMOV as `0x${string}`,
  },
  studionet: {
    chain: studionet,
    label: 'Studio Network',
    contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS_STUDIONET as `0x${string}`,
  },
} as const

export type NetworkKey = keyof typeof NETWORKS

const STORAGE_KEY = 'phasetwo:network'
const DEFAULT_NETWORK: NetworkKey = 'testnetAsimov'

function isNetworkKey(v: string | null): v is NetworkKey {
  return v !== null && v in NETWORKS
}

function readStored(): NetworkKey {
  if (typeof window === 'undefined') return DEFAULT_NETWORK
  const v = window.localStorage.getItem(STORAGE_KEY)
  return isNetworkKey(v) ? v : DEFAULT_NETWORK
}

let current: NetworkKey = readStored()
const listeners = new Set<() => void>()

export function getCurrentNetwork(): NetworkKey {
  return current
}

export function getActiveChain() {
  return NETWORKS[current].chain
}

export function getContractAddress(): `0x${string}` {
  const address = NETWORKS[current].contractAddress
  if (!address) {
    throw new Error(`Contract address not set for ${current} - see frontend/.env.local`)
  }
  return address
}

export function setCurrentNetwork(key: NetworkKey): void {
  if (key === current) return
  current = key
  window.localStorage.setItem(STORAGE_KEY, key)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Re-renders the calling component whenever the selected network changes. */
export function useNetwork(): NetworkKey {
  return useSyncExternalStore(subscribe, getCurrentNetwork, () => DEFAULT_NETWORK)
}

import { getReadClient, getContractAddress } from './genlayer-client'
import { getActiveChain, getCurrentNetwork } from './network'
import { withRetry } from './retry'

// GenVM's calldata wire format (ULEB128 type-tagged values), ported from the
// official Python reference (genlayer.calldata.decode / genvm's calldata.md
// spec). `getTransaction`'s `txCalldata` field carries a constant 4-byte
// prefix before this payload begins - confirmed empirically against real
// transactions, cause unconfirmed, but 100% consistent across differently
// shaped/sized calls.
const CALLDATA_PREFIX_BYTES = 4

const TYPE_PINT = 1
const TYPE_NINT = 2
const TYPE_BYTES = 3
const TYPE_STR = 4
const TYPE_ARR = 5
const TYPE_MAP = 6
const SPECIAL_NULL = 0
const SPECIAL_FALSE = 8
const SPECIAL_TRUE = 16
const SPECIAL_ADDR = 24

type CalldataValue = null | boolean | bigint | string | Uint8Array | CalldataValue[] | { [key: string]: CalldataValue }

function decodeCalldataMethod(hex: `0x${string}`): { method: string; args: CalldataValue[] } | null {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = Uint8Array.from(Buffer.from(clean, 'hex'))
  let pos = CALLDATA_PREFIX_BYTES

  function readByte(): number {
    if (pos >= bytes.length) throw new Error('unexpected end of calldata')
    return bytes[pos++]
  }
  function readULEB128(): bigint {
    let result = 0n
    let shift = 0n
    while (true) {
      const b = readByte()
      result |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7n
    }
    return result
  }
  function readBytes(count: number): Uint8Array {
    const slice = bytes.slice(pos, pos + count)
    pos += count
    return slice
  }
  function decodeValue(): CalldataValue {
    const code = readULEB128()
    const typ = Number(code & 0x7n)
    if (typ === 0) {
      const c = Number(code)
      if (c === SPECIAL_NULL) return null
      if (c === SPECIAL_FALSE) return false
      if (c === SPECIAL_TRUE) return true
      if (c === SPECIAL_ADDR) return `0x${Buffer.from(readBytes(20)).toString('hex')}`
      throw new Error(`unknown special code ${c}`)
    }
    const value = code >> 3n
    if (typ === TYPE_PINT) return value
    if (typ === TYPE_NINT) return -value - 1n
    if (typ === TYPE_BYTES) return readBytes(Number(value))
    if (typ === TYPE_STR) return Buffer.from(readBytes(Number(value))).toString('utf-8')
    if (typ === TYPE_ARR) {
      const arr: CalldataValue[] = []
      for (let i = 0; i < Number(value); i++) arr.push(decodeValue())
      return arr
    }
    if (typ === TYPE_MAP) {
      const obj: Record<string, CalldataValue> = {}
      for (let i = 0; i < Number(value); i++) {
        const keyLen = Number(readULEB128())
        const key = Buffer.from(readBytes(keyLen)).toString('utf-8')
        obj[key] = decodeValue()
      }
      return obj
    }
    throw new Error(`invalid calldata type ${typ}`)
  }

  try {
    const decoded = decodeValue()
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded) && 'method' in decoded) {
      const method = decoded.method
      const args = decoded.args
      if (typeof method === 'string' && Array.isArray(args)) return { method, args }
    }
    return null
  } catch {
    return null
  }
}

const MAX_BLOCK_RANGE = 9999n
const MAX_PAGES = 20 // ~3-4 days of Asimov blocks at its observed ~2s block time - generous vs the 3-day appeal window

function cacheKey(engagementId: number): string {
  return `phasetwo:judgmenttx:${getCurrentNetwork()}:${getContractAddress()}:${engagementId}`
}

/** Scans NewTransaction events addressed to `contractAddress` on the
 * currently active chain, newest first, decoding each transaction's calldata
 * and calling `visit` on it until `visit` returns a non-null/undefined
 * result (which is then returned) or the scan exhausts MAX_PAGES. Shared
 * paging/decoding infrastructure for anything that needs to find a specific
 * (or simply the most recent) real transaction to a contract purely from
 * chain state - e.g. the most recent request_release for one engagement
 * (getLastJudgmentTx), or the single most recent transaction at all
 * (lib/validators.ts's live validator-count read). Only meaningful on chains
 * with a configured consensus contract - resolves to null on chains without
 * one (e.g. Studio Network has no appealsContract either). */
export async function scanRecentTransactions<T>(
  contractAddress: `0x${string}`,
  visit: (
    tx: any,
    decoded: { method: string; args: CalldataValue[] } | null,
    txId: `0x${string}`,
  ) => T | null | undefined,
): Promise<T | null> {
  const chain = getActiveChain() as any
  const consensus = chain.consensusMainContract
  if (!consensus?.address) return null
  const newTransactionEvent = (consensus.abi ?? []).find((e: any) => e.type === 'event' && e.name === 'NewTransaction')
  if (!newTransactionEvent) return null

  const client = getReadClient()
  const latest = await withRetry(() => client.getBlockNumber())

  let toBlock = latest
  for (let page = 0; page < MAX_PAGES && toBlock > 0n; page++) {
    const fromBlock = toBlock > MAX_BLOCK_RANGE ? toBlock - MAX_BLOCK_RANGE : 0n
    const logs = await withRetry(() =>
      client.getLogs({
        address: consensus.address,
        event: newTransactionEvent,
        args: { recipient: contractAddress },
        fromBlock,
        toBlock,
      }),
    )

    // Newest first within the page.
    for (const log of [...logs].reverse()) {
      const txId = (log as any).args?.txId as `0x${string}` | undefined
      if (!txId) continue
      const tx = await withRetry(() => client.getTransaction({ hash: txId as any }))
      const decoded = decodeCalldataMethod((tx as any).txCalldata)
      const result = visit(tx, decoded, txId)
      if (result !== null && result !== undefined) return result
    }

    if (fromBlock === 0n) break
    toBlock = fromBlock - 1n
  }

  return null
}

/** Reconstructs the most recent request_release transaction hash for an
 * engagement purely from chain state, so any browser (not just the one that
 * triggered the judgment) can find it after a reload. */
export async function getLastJudgmentTx(engagementId: number): Promise<`0x${string}` | null> {
  if (typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(cacheKey(engagementId))
    if (cached) return cached as `0x${string}`
  }

  const contractAddress = getContractAddress()
  const txId = await scanRecentTransactions(contractAddress, (_tx, decoded, id) => {
    if (decoded?.method === 'request_release' && String(decoded.args[0]) === String(engagementId)) return id
    return null
  })

  if (txId && typeof window !== 'undefined') window.localStorage.setItem(cacheKey(engagementId), txId)
  return txId
}

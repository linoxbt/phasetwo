import { parseEther, type EIP1193Provider } from 'viem'
import { getReadClient, createWriteClient, getContractAddress } from './genlayer-client'
import { withRetry } from './retry'
import type { Engagement } from './types'

export async function getEngagement(id: number): Promise<Engagement> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'get_engagement',
      args: [id],
    }),
  )
  return result as unknown as Engagement
}

export async function listEngagementsFor(address: `0x${string}`): Promise<number[]> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'list_engagements_for',
      args: [address],
    }),
  )
  return (result as unknown as number[]) ?? []
}

export async function listAllIds(): Promise<number[]> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'list_all_ids',
      args: [],
    }),
  )
  return (result as unknown as number[]) ?? []
}

/** genAmount is a human-readable GEN string, e.g. "0.5" */
export async function createEngagement(
  account: `0x${string}`,
  provider: EIP1193Provider,
  counterparty: `0x${string}`,
  deliverableSpec: string,
  deadlineUnixSeconds: number,
  genAmount: string,
  parentId: number,
  allowedEvidencePrefix: string,
) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'create_engagement',
    args: [counterparty, deliverableSpec, deadlineUnixSeconds, parentId, allowedEvidencePrefix],
    value: parseEther(genAmount),
  })
}

export async function acceptEngagement(account: `0x${string}`, provider: EIP1193Provider, engagementId: number) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'accept_engagement',
    args: [engagementId],
    value: 0n,
  })
}

export async function declineEngagement(
  account: `0x${string}`,
  provider: EIP1193Provider,
  engagementId: number,
  reason: string,
) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'decline_engagement',
    args: [engagementId, reason],
    value: 0n,
  })
}

export async function submitDeliverable(
  account: `0x${string}`,
  provider: EIP1193Provider,
  engagementId: number,
  evidenceUrls: string[],
  evidenceHashes: string[],
  notes: string,
) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'submit_deliverable',
    args: [engagementId, evidenceUrls, evidenceHashes, notes],
    value: 0n,
  })
}

export async function requestRelease(account: `0x${string}`, provider: EIP1193Provider, engagementId: number) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'request_release',
    args: [engagementId],
    value: 0n,
  })
}

export async function raiseDispute(
  account: `0x${string}`,
  provider: EIP1193Provider,
  engagementId: number,
  reason: string,
  bondValue: bigint,
) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'raise_dispute',
    args: [engagementId, reason],
    value: bondValue,
  })
}

export async function getRequiredDisputeBond(engagementId: number): Promise<bigint> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'get_required_dispute_bond',
      args: [engagementId],
    }),
  )
  return BigInt(result as unknown as number)
}

export async function getMaxDisputeRounds(): Promise<number> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'get_max_dispute_rounds',
      args: [],
    }),
  )
  return result as unknown as number
}

export async function refundExpired(account: `0x${string}`, provider: EIP1193Provider, engagementId: number) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'refund_expired',
    args: [engagementId],
    value: 0n,
  })
}

export async function settleRejected(account: `0x${string}`, provider: EIP1193Provider, engagementId: number) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'settle_rejected',
    args: [engagementId],
    value: 0n,
  })
}

export async function settleApproved(account: `0x${string}`, provider: EIP1193Provider, engagementId: number) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'settle_approved',
    args: [engagementId],
    value: 0n,
  })
}

export async function getAppealWindowSeconds(): Promise<number> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'get_appeal_window_seconds',
      args: [],
    }),
  )
  return result as unknown as number
}

export async function addComment(
  account: `0x${string}`,
  provider: EIP1193Provider,
  engagementId: number,
  text: string,
) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'add_comment',
    args: [engagementId, text],
    value: 0n,
  })
}

export async function registerPubkey(account: `0x${string}`, provider: EIP1193Provider, pubkey: string) {
  const client = createWriteClient(account, provider)
  return client.writeContract({
    address: getContractAddress(),
    functionName: 'register_pubkey',
    args: [pubkey],
    value: 0n,
  })
}

export async function getPubkey(address: `0x${string}`): Promise<string> {
  const result = await withRetry(() =>
    getReadClient().readContract({
      address: getContractAddress(),
      functionName: 'get_pubkey',
      args: [address],
    }),
  )
  return (result as unknown as string) ?? ''
}

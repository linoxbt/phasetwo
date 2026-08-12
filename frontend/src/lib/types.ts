export const Status = {
  CREATED: 'created',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  RELEASED: 'released',
  REJECTED: 'rejected',
  DISPUTED: 'disputed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
} as const

export type StatusValue = (typeof Status)[keyof typeof Status]

export interface Comment {
  author: `0x${string}`
  text: string
  created_at: number
}

export interface Engagement {
  id: number
  depositor: `0x${string}`
  counterparty: `0x${string}`
  // Wei-scale u256 on the contract side - genlayer-js returns these as
  // bigint at runtime (not number), which can exceed Number.MAX_SAFE_INTEGER.
  amount: bigint
  deliverable_spec: string
  evidence_urls: string[]
  notes: string
  status: StatusValue
  decision_reasoning: string
  created_at: number
  deadline: number
  dispute_round: number
  funds_released: boolean
  comments: Comment[]
  rejected_at: number
  parent_id: number
  allowed_evidence_prefix: string
  approved_at: number
  dispute_bond: bigint
  disputer: `0x${string}`
  pre_dispute_status: string
}

export const STATUS_LABEL: Record<StatusValue, string> = {
  created: 'Created',
  accepted: 'Accepted',
  declined: 'Declined',
  submitted: 'Submitted',
  approved: 'Approved',
  released: 'Released',
  rejected: 'Rejected',
  disputed: 'Disputed',
  expired: 'Expired',
  refunded: 'Refunded',
}

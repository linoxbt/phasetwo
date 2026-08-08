export const Status = {
  CREATED: 'created',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  SUBMITTED: 'submitted',
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
  amount: number
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
}

export const STATUS_LABEL: Record<StatusValue, string> = {
  created: 'Created',
  accepted: 'Accepted',
  declined: 'Declined',
  submitted: 'Submitted',
  released: 'Released',
  rejected: 'Rejected',
  disputed: 'Disputed',
  expired: 'Expired',
  refunded: 'Refunded',
}

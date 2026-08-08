import { encrypt as ethEncrypt, type EthEncryptedData } from '@metamask/eth-sig-util'
import nacl from 'tweetnacl'
import { base64, hex, utf8 } from '@scure/base'
import type { EIP1193Provider } from 'viem'
import { registerPubkey, getPubkey } from './surety'

// Comment encryption: each party derives an x25519 keypair deterministically
// from a wallet signature (works with any wallet via personal_sign, not the
// MetaMask-only eth_decrypt/eth_getEncryptionPublicKey), publishes only the
// public half on-chain via register_pubkey, and comments are encrypted
// twice - once per party's public key - using the same x25519-xsalsa20-
// poly1305 scheme MetaMask itself uses (@metamask/eth-sig-util). The
// derived secret key never touches persistent storage - it's re-derived
// each session by re-signing.
const SIGN_MESSAGE = 'Phase Two secure messaging key v1'
const VERSION = 'x25519-xsalsa20-poly1305'

export interface CommentKeypair {
  publicKeyBase64: string
  secretKeyHex: string
}

export interface CommentEnvelope {
  depositor: EthEncryptedData
  counterparty: EthEncryptedData
}

export type DecodedComment = { plaintext: string; encrypted: boolean }

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(digest)
}

/** Deterministic: the same wallet signing the same fixed message always
 * derives the same keypair, so there's nothing to persist - re-sign to get
 * it back. */
export async function deriveKeypair(address: `0x${string}`, provider: EIP1193Provider): Promise<CommentKeypair> {
  // personal_sign expects the message hex-encoded, not raw text.
  const messageHex = `0x${hex.encode(utf8.decode(SIGN_MESSAGE))}` as `0x${string}`
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [messageHex, address],
  })) as string

  const clean = signature.startsWith('0x') ? signature.slice(2) : signature
  const seed = await sha256(hex.decode(clean))
  const keyPair = nacl.box.keyPair.fromSecretKey(seed)

  return {
    publicKeyBase64: base64.encode(keyPair.publicKey),
    secretKeyHex: hex.encode(keyPair.secretKey),
  }
}

/** No-op if this address already has this exact key registered - avoids a
 * redundant transaction every time someone unlocks secure messaging. */
export async function ensureRegistered(
  address: `0x${string}`,
  provider: EIP1193Provider,
  keypair: CommentKeypair,
): Promise<void> {
  const existing = await getPubkey(address)
  if (existing !== keypair.publicKeyBase64) {
    await registerPubkey(address, provider, keypair.publicKeyBase64)
  }
}

export function encryptComment(text: string, depositorPubkey: string, counterpartyPubkey: string): string {
  const envelope: CommentEnvelope = {
    depositor: ethEncrypt({ publicKey: depositorPubkey, data: text, version: VERSION }),
    counterparty: ethEncrypt({ publicKey: counterpartyPubkey, data: text, version: VERSION }),
  }
  return JSON.stringify(envelope)
}

/** Mirrors @metamask/eth-sig-util's decrypt() exactly (same tweetnacl call
 * sequence), reimplemented because that function calls Buffer.from()
 * internally for the private-key hex decode, and Buffer isn't available in
 * a browser bundle without a Node polyfill - @scure/base's hex codec (a
 * dependency eth-sig-util itself already uses) covers the same job without
 * one. */
function decryptWithSecretKey(secretKeyHex: string, blob: EthEncryptedData): string {
  const secretKey = hex.decode(secretKeyHex)
  const receiverKeyPair = nacl.box.keyPair.fromSecretKey(secretKey)
  const nonce = base64.decode(blob.nonce)
  const ciphertext = base64.decode(blob.ciphertext)
  const ephemPublicKey = base64.decode(blob.ephemPublicKey)
  const decrypted = nacl.box.open(ciphertext, nonce, ephemPublicKey, receiverKeyPair.secretKey)
  if (!decrypted) throw new Error('Decryption failed')
  return utf8.encode(decrypted)
}

function isEnvelope(value: unknown): value is CommentEnvelope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return isEncryptedBlob(v.depositor) && isEncryptedBlob(v.counterparty)
}

function isEncryptedBlob(value: unknown): value is EthEncryptedData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.version === 'string' && typeof v.nonce === 'string' && typeof v.ciphertext === 'string' && typeof v.ephemPublicKey === 'string'
}

/** Tries to parse+decrypt a stored comment as an envelope for the viewer's
 * role. Anything that isn't a well-formed envelope (a comment posted before
 * encryption was enabled, or directly via script/CLI bypassing the UI)
 * falls back to being shown as plain, unencrypted text rather than
 * crashing. */
export function tryDecryptComment(
  rawText: string,
  secretKeyHex: string,
  role: 'depositor' | 'counterparty',
): DecodedComment {
  try {
    const parsed: unknown = JSON.parse(rawText)
    if (!isEnvelope(parsed)) throw new Error('not an envelope')
    return { plaintext: decryptWithSecretKey(secretKeyHex, parsed[role]), encrypted: true }
  } catch {
    return { plaintext: rawText, encrypted: false }
  }
}

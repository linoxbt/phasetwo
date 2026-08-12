export const FAUCET_URL = 'https://testnet-faucet.genlayer.foundation/'
// The faucet's own claim policy - not queryable from its API, so this is a
// manually-maintained fact about an external service. Kept as the single
// source within this codebase so at least internal copies can't drift from
// each other; update here if GenLayer changes the faucet's terms.
export const FAUCET_AMOUNT = '100 GEN'
export const FAUCET_INTERVAL = 'once every 7 days'

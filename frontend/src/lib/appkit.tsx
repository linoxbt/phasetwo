import { type ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { defineChain, type AppKitNetwork } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NETWORKS } from './network'

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string

if (!projectId) {
  throw new Error('VITE_REOWN_PROJECT_ID is not set - get one at https://dashboard.reown.com and add it to .env.local')
}

// Neither GenLayer network is a built-in AppKit network, so both are defined
// here from the same chain configs genlayer-js uses. Registering both (not
// just the currently-selected one) lets useSwitchChain move a wallet between
// them without recreating the AppKit instance - see lib/network.ts for the
// runtime network switcher this backs.
function toAppKitNetwork(chain: (typeof NETWORKS)[keyof typeof NETWORKS]['chain']): AppKitNetwork {
  return defineChain({
    id: chain.id,
    caipNetworkId: `eip155:${chain.id}`,
    chainNamespace: 'eip155',
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: chain.rpcUrls.default.http as unknown as string[] },
    },
    blockExplorers: chain.blockExplorers,
  })
}

const asimovNetwork = toAppKitNetwork(NETWORKS.testnetAsimov.chain)
const studioNetwork = toAppKitNetwork(NETWORKS.studionet.chain)
const appKitNetworks: [AppKitNetwork, ...AppKitNetwork[]] = [asimovNetwork, studioNetwork]

const metadata = {
  name: 'Phase Two',
  description: 'Locks payment for a deliverable, released only when validators verify the evidence.',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://phasetwo.example',
  icons: [],
}

export const wagmiAdapter = new WagmiAdapter({
  networks: appKitNetworks,
  projectId,
  ssr: false,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks: appKitNetworks,
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#ff5a1f',
  },
  features: { analytics: false, email: false, socials: false },
})

const queryClient = new QueryClient()

export function AppKitProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

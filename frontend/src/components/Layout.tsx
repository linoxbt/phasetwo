import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { WalletButton } from './WalletButton'
import { Logo, LogoMark } from './Logo'
import { NetworkBanner } from './NetworkBanner'
import { NetworkSwitcher } from './NetworkSwitcher'
import { IconMenu, IconClose, IconList, IconPlus, IconBook, IconChartBar, IconSidebar } from './icons'
import { useWallet } from '../lib/wallet'
import { listEngagementsFor, getEngagement } from '../lib/surety'
import { getUnseenChanges } from '../lib/activity'
import { mapWithConcurrency } from '../lib/concurrency'
import { useNetwork } from '../lib/network'
import { STATUS_LABEL, type StatusValue } from '../lib/types'
import { splitTitle } from '../lib/format'

const ACTIVITY_POLL_MS = 60_000
const TOAST_LIFETIME_MS = 8_000

const NAV_LINKS = [
  { to: '/stats', label: 'Transparency', icon: IconChartBar },
  { to: '/app', label: 'My Engagements', icon: IconList },
  { to: '/app/create', label: 'Create Engagement', icon: IconPlus },
  { to: '/docs', label: 'Docs', icon: IconBook },
]

const COLLAPSE_KEY = 'phasetwo:sidebar-collapsed'

export function Layout() {
  const location = useLocation()
  const { address } = useWallet()
  const network = useNetwork()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unseenCount, setUnseenCount] = useState(0)
  const [toasts, setToasts] = useState<{ key: string; message: string }[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  })
  const notifiedKeys = useRef(new Set<string>())
  const originalTitle = useRef(document.title)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // "Changed since your last visit" - purely client-side, no backend to push
  // from, so this polls while the wallet is connected rather than alerting
  // live. Surfaces a toast + browser Notification (if permitted) the first
  // time each change is seen, and badges the tab title/sidebar icon for as
  // long as any change remains unvisited.
  useEffect(() => {
    if (!address) {
      setUnseenCount(0)
      setToasts([])
      return
    }
    let cancelled = false
    async function check() {
      try {
        const ids = await listEngagementsFor(address!)
        const engagements = await mapWithConcurrency(ids, 1, getEngagement)
        if (cancelled) return
        const changes = getUnseenChanges(address!, engagements)
        setUnseenCount(changes.length)

        const fresh = changes.filter((c) => !notifiedKeys.current.has(`${c.id}:${c.status}`))
        if (fresh.length === 0) return
        for (const c of fresh) notifiedKeys.current.add(`${c.id}:${c.status}`)

        const notificationsSupported = typeof Notification !== 'undefined'
        if (notificationsSupported && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => {})
        }

        for (const c of fresh) {
          const eng = engagements.find((e) => e.id === c.id)
          const { title } = splitTitle(eng?.deliverable_spec ?? '')
          const label = STATUS_LABEL[c.status as StatusValue] ?? c.status
          const message = `#${c.id}${title ? ` - ${title}` : ''}: now ${label.toLowerCase()}`
          const key = `${c.id}:${c.status}:${Date.now()}`
          setToasts((prev) => [...prev, { key, message }])
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.key !== key)), TOAST_LIFETIME_MS)

          if (notificationsSupported && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            try {
              new Notification('Phase Two', { body: message })
            } catch {
              // Notification construction can throw in some embedded/webview
              // contexts even when permission reports granted - a missed
              // native notification isn't worth surfacing as an error, the
              // in-app toast above already covers it.
            }
          }
        }
      } catch {
        // network hiccup - next poll retries, no need to surface this as an error
      }
    }
    check()
    const interval = setInterval(check, ACTIVITY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // network is a dependency so switching networks re-polls against the newly selected contract
  }, [address, network])

  useEffect(() => {
    document.title = unseenCount > 0 ? `(${unseenCount}) ${originalTitle.current}` : originalTitle.current
  }, [unseenCount])

  // Visiting My Engagements is what actually marks changes seen (see
  // MyEngagements.tsx/EngagementDetail.tsx) - clear the badge/title the
  // moment that happens rather than waiting for the next poll tick.
  useEffect(() => {
    if (location.pathname === '/app') setUnseenCount(0)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex min-h-screen bg-cream">
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-ink/8 bg-paper transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 lg:transition-[width] lg:duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'}`}
      >
        <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? 'lg:justify-center lg:px-0' : 'justify-between'}`}>
          <Link to="/">
            {/* Mobile drawer is never collapsed - always show the full lockup there. */}
            <span className="lg:hidden">
              <Logo size={24} />
            </span>
            <span className={collapsed ? 'hidden lg:block' : 'hidden'}>
              <LogoMark size={26} />
            </span>
            <span className={collapsed ? 'hidden' : 'hidden lg:block'}>
              <Logo size={24} />
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-ink lg:hidden"
          >
            <IconClose width={18} height={18} />
          </button>
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((v) => !v)}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink lg:flex"
          >
            <IconSidebar width={18} height={18} />
          </button>
        </div>

        <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2 ${collapsed ? 'lg:items-center lg:px-2' : ''}`}>
          {NAV_LINKS.map((l) => {
            const active = location.pathname === l.to
            return (
              <Link
                key={l.to}
                to={l.to}
                title={l.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-ink/5 text-ink' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
                } ${collapsed ? 'lg:w-11 lg:justify-center lg:px-0' : ''}`}
              >
                <span className="relative shrink-0">
                  <l.icon width={18} height={18} />
                  {l.to === '/app' && unseenCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-coral-500" />
                  )}
                </span>
                <span className={collapsed ? 'lg:hidden' : ''}>{l.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className={`border-t border-ink/8 p-3 ${collapsed ? 'lg:flex lg:justify-center' : ''}`}>
          <div className={`space-y-2 ${collapsed ? 'lg:hidden' : ''}`}>
            <NetworkSwitcher />
            <WalletButton />
          </div>
          <div className={`hidden ${collapsed ? 'lg:block' : ''}`}>
            <WalletButton compact />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <NetworkBanner />
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/8 bg-cream/85 px-4 py-4 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink"
          >
            <IconMenu width={20} height={20} />
          </button>
          <Link to="/">
            <Logo size={22} />
          </Link>
          <div className="w-10" />
        </div>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.key}
              className="flex items-start gap-2 rounded-xl border border-ink/10 bg-paper p-3.5 text-sm text-ink shadow-lg"
            >
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" />
              <p className="flex-1">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToasts((prev) => prev.filter((x) => x.key !== t.key))}
                className="shrink-0 text-ink-soft hover:text-ink"
              >
                <IconClose width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

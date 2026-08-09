import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconLock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2.2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <circle cx="12" cy="15.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function IconScale(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v18" />
      <path d="M6 7h12" />
      <path d="M6 7L3 13a3 3 0 0 0 6 0L6 7Z" />
      <path d="M18 7l-3 6a3 3 0 0 0 6 0l-3-6Z" />
      <path d="M9 21h6" />
    </svg>
  )
}

export function IconCheckShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l7 3v5.5c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5V6l7-3Z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  )
}

export function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

export function IconChain(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="9" width="7" height="7" rx="1.6" />
      <rect x="14" y="9" width="7" height="7" rx="1.6" />
      <path d="M10 12.5h4" />
    </svg>
  )
}

export function IconGavel(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4l6 6" />
      <path d="M9.5 8.5l6 6" />
      <path d="M3 21l7-7" />
      <path d="M11.5 6l6-4 4 4-6 6" transform="translate(0.5 0)" />
      <path d="M8 11.5l-4 4 3 3 4-4" />
    </svg>
  )
}

export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

export function IconNetwork(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="4" r="1.8" />
      <circle cx="19.5" cy="8.5" r="1.8" />
      <circle cx="19.5" cy="15.5" r="1.8" />
      <circle cx="12" cy="20" r="1.8" />
      <circle cx="4.5" cy="15.5" r="1.8" />
      <circle cx="4.5" cy="8.5" r="1.8" />
      <path d="M12 6.2v3.4M17.9 9.4l-3.8 2.4M17.9 14.6l-3.8-2.2M12 17.8v-3.4M6.1 14.6l3.8-2.2M6.1 9.4l3.8 2.4" opacity="0.6" />
    </svg>
  )
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h16" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  )
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

export function IconBook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5H7.5A2.5 2.5 0 0 0 5 21V5.5Z" />
      <path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19" />
    </svg>
  )
}

export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

export function IconList(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

export function IconWallet(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M3.5 10h17" />
      <circle cx="16" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSidebar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  )
}

export function IconChartBar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-7" />
    </svg>
  )
}

export function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.4" />
      <rect x="13" y="4" width="7" height="7" rx="1.4" />
      <rect x="4" y="13" width="7" height="7" rx="1.4" />
      <rect x="13" y="13" width="7" height="7" rx="1.4" />
    </svg>
  )
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconFlag(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3v18" />
      <path d="M6 4.5c2-1.2 4-1.2 6 0s4 1.2 6 0v9c-2 1.2-4 1.2-6 0s-4-1.2-6 0Z" />
    </svg>
  )
}

export function IconChatBubble(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5h16v11H10l-4 3.5v-3.5H4Z" />
    </svg>
  )
}

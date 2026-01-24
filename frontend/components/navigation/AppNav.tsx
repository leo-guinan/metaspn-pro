'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AppNav() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/settings/integrations', label: 'Settings' },
  ]

  return (
    <nav style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className="button secondary"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.9rem',
                  ...(isActive && {
                    borderColor: 'var(--gold)',
                    background: 'rgba(212, 175, 55, 0.1)',
                  }),
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

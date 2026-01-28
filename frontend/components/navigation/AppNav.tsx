'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { adminApi } from '@/lib/api'
import { useAuth } from '@/lib/contexts/AuthContext'

export default function AppNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }

    const checkAdmin = async () => {
      try {
        const result = await adminApi.checkAdmin()
        setIsAdmin(result.is_admin)
      } catch (error) {
        setIsAdmin(false)
      }
    }

    checkAdmin()
  }, [user])

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/settings/repo', label: 'Repo' },
    { href: '/settings/integrations', label: 'Settings' },
  ]

  // Add admin link if user is admin
  if (isAdmin) {
    navItems.push({ href: '/admin', label: 'Admin' })
  }

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
                  // Special styling for admin link
                  ...(item.href === '/admin' && {
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    color: '#f87171',
                  }),
                  ...(item.href === '/admin' && isActive && {
                    borderColor: '#f87171',
                    background: 'rgba(239, 68, 68, 0.1)',
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

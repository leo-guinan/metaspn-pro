'use client'

import { ReactNode } from 'react'
import { GameProvider } from '@/lib/contexts/GameContext'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { AuthGuard } from '@/components/auth/AuthGuard'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <AuthGuard>
        <GameProvider>{children}</GameProvider>
      </AuthGuard>
    </AuthProvider>
  )
}

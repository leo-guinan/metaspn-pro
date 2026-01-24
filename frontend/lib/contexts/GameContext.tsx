'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { GameSelection } from '../types/games'
import { getGameSelection, setGameSelection as saveGameSelection } from '../utils/gameStorage'

interface GameContextType {
  selection: GameSelection | null
  setSelection: (selection: GameSelection) => void
  clearSelection: () => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

export function GameProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<GameSelection | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = getGameSelection()
    setSelectionState(stored)
  }, [])

  const setSelection = (newSelection: GameSelection) => {
    setSelectionState(newSelection)
    saveGameSelection(newSelection)
  }

  const clearSelection = () => {
    setSelectionState(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('metaspn_game_selection')
    }
  }

  // Always provide context, but selection will be null until mounted
  // This prevents hydration mismatches while ensuring context is available
  return (
    <GameContext.Provider value={{ selection, setSelection, clearSelection }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/lib/contexts/GameContext'
import GameSelection from '@/components/game/GameSelection'
import SubGameSelection from '@/components/game/SubGameSelection'
import RoleSelection from '@/components/game/RoleSelection'
import type { GameType, WriterSubGame, PodcastRole, WriterRole } from '@/lib/types/games'

type SelectionStep = 'game' | 'subgame' | 'role'

interface GameSelectionFlowProps {
  showNav?: boolean
  NavComponent?: React.ComponentType
}

export default function GameSelectionFlow({ showNav = false, NavComponent }: GameSelectionFlowProps) {
  const { setSelection } = useGame()
  const router = useRouter()
  const [step, setStep] = useState<SelectionStep>('game')
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null)
  const [selectedSubGame, setSelectedSubGame] = useState<WriterSubGame | null>(null)

  const handleGameSelect = (game: GameType) => {
    setSelectedGame(game)
    if (game === 'podcast') {
      setStep('role')
    } else {
      setStep('subgame')
    }
  }

  const handleSubGameSelect = (subGame: WriterSubGame) => {
    setSelectedSubGame(subGame)
    setStep('role')
  }

  const handleRoleSelect = (role: PodcastRole | WriterRole) => {
    if (!selectedGame) return

    const selection = {
      game: selectedGame,
      ...(selectedSubGame && { subGame: selectedSubGame }),
      role,
    }

    setSelection(selection)

    // Navigate to the appropriate route
    if (selectedGame === 'podcast') {
      router.push(`/game/podcast/${role}`)
    } else if (selectedSubGame) {
      router.push(`/game/writer/${selectedSubGame}/${role}`)
    }
  }

  const handleBack = () => {
    if (step === 'role') {
      if (selectedGame === 'writer') {
        setStep('subgame')
      } else {
        setStep('game')
        setSelectedGame(null)
      }
    } else if (step === 'subgame') {
      setStep('game')
      setSelectedGame(null)
      setSelectedSubGame(null)
    }
  }

  const renderContent = () => {
    if (step === 'game') {
      return <GameSelection onSelect={handleGameSelect} />
    }

    if (step === 'subgame' && selectedGame === 'writer') {
      return <SubGameSelection onSelect={handleSubGameSelect} onBack={handleBack} />
    }

    if (step === 'role' && selectedGame) {
      return (
        <RoleSelection
          game={selectedGame}
          subGame={selectedSubGame || undefined}
          onSelect={handleRoleSelect}
          onBack={handleBack}
        />
      )
    }

    return null
  }

  return (
    <>
      {showNav && NavComponent && <NavComponent />}
      {renderContent()}
    </>
  )
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import GameNav from '@/components/game/GameNav'
import { useGame } from '@/lib/contexts/GameContext'
import type { WriterSubGame, WriterRole } from '@/lib/types/games'

export default function WriterRolePage() {
  const params = useParams()
  const router = useRouter()
  const { selection } = useGame()
  const subGame = params.subGame as WriterSubGame
  const role = params.role as WriterRole

  useEffect(() => {
    // Redirect if no selection or wrong game
    if (
      !selection ||
      selection.game !== 'writer' ||
      selection.subGame !== subGame ||
      selection.role !== role
    ) {
      router.push('/')
    }
  }, [selection, subGame, role, router])

  if (!selection || selection.game !== 'writer') {
    return null
  }

  const getRoleContent = () => {
    const formatLabel = subGame === 'short-form' ? 'Short Form' : 'Long Form'
    
    if (role === 'author') {
      return {
        title: `${formatLabel} Author Dashboard`,
        description: `Track your ${subGame === 'short-form' ? 'tweets and social posts' : 'blog posts and articles'}, measure engagement, and see how your writing influences readers.`,
      }
    } else {
      return {
        title: `${formatLabel} Reader Dashboard`,
        description: `Track what you read in ${subGame === 'short-form' ? 'short-form content' : 'long-form articles'}, discover influence patterns, and see how reading shapes your thinking.`,
      }
    }
  }

  const content = getRoleContent()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <GameNav />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">{content.title}</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
            {content.description}
          </p>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <p className="text-gray-600 dark:text-gray-400">
              Role-specific content coming soon. This is the {role} view for {subGame === 'short-form' ? 'Short Form' : 'Long Form'} Writer Game.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

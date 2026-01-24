import type { GameSelection } from '../types/games'

const STORAGE_KEY = 'metaspn_game_selection'

export function getGameSelection(): GameSelection | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as GameSelection
  } catch (error) {
    console.error('Failed to read game selection from localStorage:', error)
    return null
  }
}

export function setGameSelection(selection: GameSelection): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch (error) {
    console.error('Failed to save game selection to localStorage:', error)
  }
}

export function clearGameSelection(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear game selection from localStorage:', error)
  }
}

export function hasGameSelection(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) !== null
}

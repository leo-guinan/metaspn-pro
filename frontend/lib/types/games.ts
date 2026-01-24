export type GameType = 'podcast' | 'writer'
export type PodcastRole = 'host' | 'guest' | 'listener'
export type WriterSubGame = 'short-form' | 'long-form'
export type WriterRole = 'author' | 'reader'

export interface GameSelection {
  game: GameType
  subGame?: WriterSubGame
  role: PodcastRole | WriterRole
}

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Sans } from 'next/font/google'
import '@fontsource/jetbrains-mono'
import './globals.css'
import { Providers } from '@/components/Providers'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--sans',
})

export const metadata: Metadata = {
  title: 'MetaSPN Pro',
  description: 'Podcast intelligence layer for listeners, podcasters, and guests',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body className={ibmPlexSans.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

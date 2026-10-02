/* eslint react-refresh/only-export-components: ["error", { "allowExportNames": ["metadata"] }] -- Next.js reads metadata from route layouts. */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next.js workspace',
  description: 'A Next.js App Router application in your pnpm workspace.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ErrorBoundary from '@/components/error-boundary'
import { Toaster } from '@/components/ui/sonner'
import NewRelicProvider from '@/components/NewRelicProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Rootly Burnout Detector',
  description: 'Prevent engineering burnout before it impacts your team',
  icons: {
    icon: '/images/favicon.png',
    shortcut: '/images/favicon.png',
    apple: '/images/favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NewRelicProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </NewRelicProvider>
      </body>
    </html>
  )
}

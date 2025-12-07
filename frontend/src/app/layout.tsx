import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import ErrorBoundary from '@/components/error-boundary'
import NewRelicProvider from '@/components/NewRelicProvider'
import ClientToaster from '@/components/ClientToaster'
import { GettingStartedProvider } from '@/contexts/GettingStartedContext'
import { GettingStartedDialog } from '@/components/GettingStartedDialog'

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
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang="en">
      <body className={inter.className}>
        {gaMeasurementId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga-script"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaMeasurementId}');
                `,
              }}
            />
          </>
        )}
        <NewRelicProvider>
          <GettingStartedProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <GettingStartedDialog />
            <ClientToaster />
          </GettingStartedProvider>
        </NewRelicProvider>
      </body>
    </html>
  )
}

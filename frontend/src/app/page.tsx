import AuthRedirectGate from '@/components/AuthRedirectGate'
import LandingPage from '@/components/landing-page'

export default function Home() {
  return (
    <AuthRedirectGate>
      <LandingPage />
    </AuthRedirectGate>
  )
}

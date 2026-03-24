"use client"

import { useState, useEffect, useRef } from "react"
import localFont from "next/font/local"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Link2, Brain, Target, Github, Chrome, Loader2, Flame, Linkedin } from "lucide-react";
import { siX } from "simple-icons"
import Image from "next/image"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const OKTA_SSO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_OKTA_SSO === 'true'

const ppMori = localFont({
  src: [
    {
      path: "../../public/fonts/PPMori/PPMori-Extralight.otf",
      weight: "200",
      style: "normal",
    },
    {
      path: "../../public/fonts/PPMori/PPMori-Book.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/PPMori/PPMori-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/PPMori/PPMori-RegularItalic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../public/fonts/PPMori/PPMori-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/PPMori/PPMori-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
  ],
})

// TODO: set the meta title and description - what's the right way of doing it?

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState<'google' | 'github' | 'okta' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Preload background images and autoplay video on mount
  useEffect(() => {
    const preloadImage = (url: string) => {
      const img = new window.Image()
      img.src = url
    }

    preloadImage('/images/landing/rootly-bg-hq.webp')
    preloadImage('/images/landing/rootly-bg-gradient.avif')
    preloadImage('/images/landing/cta-background.png')

    // Autoplay and set volume
    if (videoRef.current) {
      videoRef.current.volume = 0.2
      videoRef.current.play().catch(err => console.log('Autoplay failed:', err))
    }
  }, [])

  const handleGoogleLogin = async () => {
    try {
      setIsLoading('google')
      // Pass the current origin to the backend
      const currentOrigin = window.location.origin
      const response = await fetch(`${API_BASE}/auth/google?redirect_origin=${encodeURIComponent(currentOrigin)}`)
      
      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Google auth API error:', response.status, errorText)
        throw new Error(`Authentication failed: ${response.status}`)
      }
      
      // Check content type to ensure it's JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text()
        console.error('Expected JSON but got:', contentType, responseText)
        throw new Error('Invalid response format from authentication server')
      }
      
      const data = await response.json()
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        console.error('No authorization URL in response:', data)
        throw new Error('Invalid authentication response')
      }
    } catch (error) {
      console.error('Google login error:', error)
      setIsLoading(null) // Reset loading state on error
    }
  }

  const handleGitHubLogin = async () => {
    try {
      setIsLoading('github')
      // Pass the current origin to the backend
      const currentOrigin = window.location.origin
      const response = await fetch(`${API_BASE}/auth/github?redirect_origin=${encodeURIComponent(currentOrigin)}`)

      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text()
        console.error('GitHub auth API error:', response.status, errorText)
        throw new Error(`Authentication failed: ${response.status}`)
      }

      // Check content type to ensure it's JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text()
        console.error('Expected JSON but got:', contentType, responseText)
        throw new Error('Invalid response format from authentication server')
      }

      const data = await response.json()
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        console.error('No authorization URL in response:', data)
        throw new Error('Invalid authentication response')
      }
    } catch (error) {
      console.error('GitHub login error:', error)
      setIsLoading(null) // Reset loading state on error
    }
  }

  const handleOktaLogin = async () => {
    try {
      setIsLoading('okta')
      const currentOrigin = window.location.origin
      const response = await fetch(`${API_BASE}/auth/okta?redirect_origin=${encodeURIComponent(currentOrigin)}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Okta auth API error:', response.status, errorText)
        throw new Error(`Authentication failed: ${response.status}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text()
        console.error('Expected JSON but got:', contentType, responseText)
        throw new Error('Invalid response format from authentication server')
      }

      const data = await response.json()
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      } else {
        console.error('No authorization URL in response:', data)
        throw new Error('Invalid authentication response')
      }
    } catch (error) {
      console.error('Okta login error:', error)
      setIsLoading(null)
    }
  }

  return (
    <div className={`${ppMori.className} min-h-screen bg-white overflow-x-hidden`}>

      {/* Hero Section */}
      <section className="bg-[url(/images/landing/rootly-bg-hq.webp)] bg-cover bg-[position:50%_15%] lg:bg-[size:210%] lg:bg-[position:-1200px_-300px] relative lg:pb-[120px]" id="get-started">
        {/* Header */}
        <div className="px-4 pt-6 pb-2 lg:px-16 lg:pt-8">
          <div className="flex items-start justify-between w-full gap-4">
            <div className="flex flex-col items-start -space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="text-xl leading-[1rem] lg:text-3xl font-normal text-black">On-Call Health</div>
                <Image
                  src="/images/on-call-health-logo.svg"
                  alt="On-Call Health"
                  width={32}
                  height={32}
                  className="w-7 h-7 lg:w-10 lg:h-10 -mt-1"
                />
              </div>
              <div className="text-[10px] lg:text-xs text-black/70 font-light flex items-center gap-1.5">
                <span>Powered by</span>
                <a href="https://rootly.com" target="_blank">
                  <Image
                    src="/images/rootly-ai-logo.png"
                    alt="Rootly"
                    width={321}
                    height={129}
                    className="w-[60px] lg:w-[70px]"
                  />
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3 self-start">
              {OKTA_SSO_ENABLED && (
                <Button
                  size="lg"
                  className="h-10 rounded-2xl border border-[#0f2f7c]/30 bg-[#00297A] px-4 text-sm font-semibold font-display text-white hover:bg-[#001f5c] flex items-center gap-2"
                  onClick={handleOktaLogin}
                  disabled={isLoading === "okta"}
                  title="For self-hosted or dedicated enterprise deployments"
                >
                  <span className="flex items-center gap-2">
                    {isLoading === "okta" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="relative top-[1px]">Connecting...</span>
                      </>
                    ) : (
                      <>
                        <Image src="/images/okta-icon.png" alt="Okta" width={16} height={16} className="h-4 w-4" />
                        <span className="relative top-[1px]">Okta SSO</span>
                      </>
                    )}
                  </span>
                </Button>
              )}
              <a
                href="https://github.com/Rootly-AI-Labs/On-Call-Health"
                target="_blank"
                rel="noreferrer"
                className="h-10 rounded-2xl bg-[#7b6db1] px-5 text-sm font-semibold font-display text-[color:var(--text-text-primary,_#100F12)] hover:bg-[#6f62a5] flex items-center gap-2"
              >
                <Image src="/images/github-logo.png" alt="GitHub" width={20} height={20} className="h-4 w-4 lg:h-5 lg:w-5" />
                <span className="relative top-[2px]">View on GitHub</span>
              </a>
            </div>
          </div>
        </div>
        <div className="container flex flex-col lg:flex-row flex-grow mx-auto px-4">
          <main className="w-full flex-grow px-5 lg:pr-10 lg:w-[60%] text-white relative lg:top-14 lg:-ml-8">
            <div className="inline-flex items-center rounded-full border-[0.25px] border-white/50 px-2.5 py-1 text-[9px] tracking-[0.3em] uppercase font-bold text-white/80 mb-2 mt-4 lg:mb-6 translate-x-1 translate-y-1 lg:text-[10px] lg:tracking-[0.35em]">
              <span className="relative top-[1px]">OPEN SOURCE - APACHE LICENSE 2.0</span>
            </div>
            <h1 className="text-4xl lg:text-6xl tracking-tight mb-6 leading-tight pt-2 lg:pt-10 lg:pb-1 leading-snug relative lg:-top-8">
              Catch exhaustion
              <br />
              before it burns out
              <br />
              your engineers.
            </h1>

            <p className="text-lg lg:text-xl lg:pr-10 mb-4 relative lg:-top-3">
              An open source tool that looks for signs of overload in
              <br />
              your on-call engineers.
            </p>

            {/* OAuth Login Buttons */}
            <div id="login" className="mt-6 flex flex-col sm:flex-row gap-4 items-center mb-6">
            <Button
              size="lg"
              className="w-full rounded-3xl sm:w-auto bg-[#E4E5EB] hover:bg-[#d7d8de] text-[color:var(--color-blue-15,_#1E1A33)] px-6 py-5 text-base font-display font-bold flex items-center justify-center lg:px-8 lg:py-7 lg:text-lg"
              onClick={handleGoogleLogin}
              disabled={isLoading === "google"}
            >
              <span className="flex items-center justify-center gap-3 translate-y-[1.5px]">
                {isLoading === "google" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting to Google...
                  </>
                ) : (
                  <>
                    <Chrome className="h-6 w-6 -translate-y-0.5" aria-hidden="true" />
                    Sign in with Google
                  </>
                )}
              </span>
            </Button>

            <Button
              size="lg"
              className="w-full rounded-3xl sm:w-auto bg-[#100F12] hover:bg-[#1b1a1e] text-[color:var(--text-text-contrast,_#FFFFFF)] px-6 py-5 text-base font-display font-bold flex items-center justify-center lg:px-8 lg:py-7 lg:text-lg"
              onClick={handleGitHubLogin}
              disabled={isLoading === "github"}
            >
              <span className="flex items-center justify-center gap-3 translate-y-[1.5px]">
                {isLoading === "github" ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting to GitHub...
                  </>
                ) : (
                  <>
                    <Github className="h-6 w-6 -translate-y-0.5" aria-hidden="true" />
                    Sign in with GitHub
                  </>
                )}
              </span>
            </Button>

            </div>
          </main>
          <aside className="w-full mt-10 lg:mt-0 lg:w-[40%] lg:pl-20">
            <div className="mx-auto lg:ml-auto max-w-2xl lg:max-w-none lg:-translate-x-48 lg:translate-y-28 lg:w-[135%] overflow-visible">
              <div className="rounded-[28px] border border-white bg-transparent p-1" style={{ WebkitBackfaceVisibility: 'hidden' }}>
                <div className="aspect-video w-full overflow-hidden rounded-[22px]">
                  <video
                    ref={videoRef}
                    className="h-full w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    crossOrigin="anonymous"
                    autoPlay
                    muted
                  >
                    <source src="/videos/on-call-health-promo-video.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
            </div>
          </aside>
        </div>
        {/* Features Banner */}
        <div className="container mx-auto px-4 pt-12 pb-0 mt-6 lg:mt-40 lg:py-20 relative z-10">
          <Image
            src="/images/landing/wandb_testimonial_large.png"
            alt="Rootly customer story"
            width={1784}
            height={602}
            className="w-11/12 sm:w-4/5 lg:w-2/3 h-auto mx-auto mt-2 lg:mt-0"
            priority
            quality={90}
          />
        </div>
    <div className="w-full mb-[-1px] absolute h-[240px] bottom-0 left-0 z-0 lg:h-[250px] bg-gradient-to-b from-transparent via-white/60 to-white pointer-events-none">                               
    </div> 
      </section>
      <div className="mx-auto my-12 h-px w-2/3 bg-slate-200 lg:hidden" />

      {/* How It Works Section */}
      <section className="pt-0 pb-0 bg-white lg:pt-8 lg:pb-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-4">
            <h2 className="text-4xl md:text-5xl font-semibold text-slate-900 mb-4">Spot overload before it spirals.</h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Objective signals that make the case for change.
            </p>
            <Image
              src="/images/landing/integration-dashboard.png"
              alt="Integration dashboard overview"
              width={2400}
              height={1322}
              sizes="80vw"
              className="w-[95%] sm:w-[90%] lg:w-[80%] h-auto mt-10 lg:mt-20 mb-20 mx-auto"
              quality={90}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-[95%] sm:w-[90%] lg:w-[80%] mx-auto items-stretch">
            <div className="rounded-2xl border border-purple-100 px-7 pt-7 pb-2 h-full min-h-[220px] sm:min-h-[260px] lg:min-h-[300px]" style={{ background: "var(--surface-surface-bg-accent-shade, #F7F5FF)" }}>
              <h3 className="text-xl font-semibold text-slate-900 mb-6">Connect signals</h3>
              <p className="text-slate-600 leading-relaxed mb-0 mt-2">
                Start with Rootly or PagerDuty for incident data, add Linear for ticket workload, GitHub for after-hours signals, and Slack for communication patterns and context.
              </p>
            </div>
            <div className="rounded-2xl border border-purple-100 px-6 pt-6 pb-0 h-full min-h-[220px] sm:min-h-[260px] lg:min-h-[300px]" style={{ background: "var(--surface-surface-bg-accent-shade, #F7F5FF)" }}>
              <h3 className="text-xl font-semibold text-slate-900 mb-6">Collect sentiment</h3>
              <p className="text-slate-600 leading-relaxed mb-0 mt-2">
                Periodically send short surveys in Slack so responders can share how they're doing. Fast, low-friction, and designed to reduce stigma (not create it).
              </p>
            </div>
            <div className="rounded-2xl border border-purple-100 px-6 pt-6 pb-0 h-full min-h-[220px] sm:min-h-[260px] lg:min-h-[300px]" style={{ background: "var(--surface-surface-bg-accent-shade, #F7F5FF)" }}>
              <h3 className="text-xl font-semibold text-slate-900 mb-6">See who's at risk</h3>
              <p className="text-slate-600 leading-relaxed mb-0 mt-2">
                On-Call Health computes individual risk scores from ingested data:
                <span className="text-green-600 font-semibold"> 0-24</span> Maintain balance,
                <span className="text-yellow-600 font-semibold"> 25-49</span> Monitor risk,
                <span className="text-orange-600 font-semibold"> 50-74</span> Early intervention,
                <span className="text-red-600 font-semibold"> 75-100</span> Immediate action.
              </p>
            </div>
            <div className="rounded-2xl border border-purple-100 px-6 pt-6 pb-0 h-full min-h-[220px] sm:min-h-[260px] lg:min-h-[300px]" style={{ background: "var(--surface-surface-bg-accent-shade, #F7F5FF)" }}>
              <h3 className="text-xl font-semibold text-slate-900 mb-6">Act early with confidence</h3>
              <p className="text-slate-600 leading-relaxed mb-0 mt-2">
                AI analyzes what changed (and what’s driving it) so you can make better, informed decisions to protect your engineers before risk becomes burnout.
                </p>
            </div>
          </div>
          <div className="mx-auto my-12 h-px w-2/3 bg-slate-200 lg:hidden" />

        </div>
      </section>
      <section className="mt-0 lg:mt-32">
        <div className="container mt-0 lg:mt-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-1 lg:gap-12 w-[95%] sm:w-[90%] lg:w-[80%] mx-auto">
            <div className="pt-0 pb-4 lg:py-10">
              <h2 className="text-3xl md:text-4xl text-slate-900 mb-4">Catch exhaustion before it becomes burnout.</h2>
              <p className="mb-2 text-lg text-[#787685]">
              Spot trend shifts before burnout becomes reality—so you can intervene while fixes are still small: 
              rebalance rotations, add automation, pause non-urgent work, or staff up.
              </p>

            </div>
            <Image
              src="/images/landing/risk-factors.png"
              alt="Risk factors team card"
              width={1935}
              height={1686}
              sizes="(min-width: 1280px) 60vw, (min-width: 1024px) 70vw, 100vw"
              className="w-full h-auto object-contain"
              quality={90}
            />

          </div>
          </div>
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-1 lg:gap-12 mt-20 mb-20 w-[95%] sm:w-[90%] lg:w-[80%] mx-auto">
              <div className="order-2 lg:order-1">
                <Image
                  src="/images/landing/trends.png"
                  alt="Team Risk Factors Trends"
                  width={1935}
                  height={1686}
                  sizes="(min-width: 1280px) 60vw, (min-width: 1024px) 70vw, 100vw"
                  className="w-full h-auto object-contain"
                  quality={90}
                />
              </div>
              <div className="py-4 lg:py-10 order-1 lg:order-2">
                <h2 className="text-3xl md:text-4xl text-slate-900 mb-4">Make on-call health measurable and fair.</h2>
                <p className="mb-2 text-lg text-[#787685]">
                On-Call Health uses team and individual-specific baselines to track trends over time, 
                rather than relying on fixed thresholds or comparing people to each other.
                </p>
              </div>
            </div>
          </div>
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-1 lg:gap-12 mt-20 w-[95%] sm:w-[90%] lg:w-[80%] mx-auto">
              <div className="py-4 lg:py-10">
                <h2 className="text-3xl md:text-4xl text-slate-900 mb-4">Align the team and act <br/> faster.</h2>
                <p className="mb-2 text-lg text-[#787685]">
                AI summaries help stakeholders quickly get up to speed on trends they may have missed, turning weekly incident
                reviews into conversations about not just systems, but also the people behind them.             
              </p>
              </div>
              <Image
                src="/images/landing/ai-views.png"
                alt="Screenshots of AI Team insights"
                width={1935}
                height={1686}
                sizes="(min-width: 1280px) 60vw, (min-width: 1024px) 70vw, 100vw"
                className="w-full h-auto object-contain"
                quality={90}
              />
            </div>
          </div>
          <div className="mt-10 lg:mt-20 mb-0 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[url(/images/landing/cta-background.png)] bg-cover bg-center lg:bg-[center_top_-450px]">
            <div className="grid place-items-center px-6 py-16 lg:py-20 text-center">
              <h2 className="text-4xl md:text-5xl font-medium text-slate-900 mb-6">Detect who's at risk of burnout<br /> in your team today.</h2>
              <div className="flex flex-col justify-center sm:flex-row gap-4 items-center mb-6">
                <a href="#get-started"
                  className="w-full inline-flex items-center justify-center rounded-2xl sm:w-auto bg-[#7a6db4] hover:bg-[#6b5fa8] text-white px-8 py-3 text-lg"
                >
                  Get started for free
                </a>
                <a
                  href="https://github.com/Rootly-AI-Labs/On-Call-Health"
                  target="_blank"
                  className="w-full inline-flex items-center justify-center rounded-2xl sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 text-lg"
                >
                  See project on GitHub 
                </a>
              </div>
            </div>
          </div>
      </section>

      <footer className="bg-[#0b0c10] text-white py-8 lg:py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div>
              <a href="https://rootly.com" target="_blank" rel="noreferrer">
                <Image
                  src="/images/rootly-ai-logo-white.png"
                  alt="Rootly AI"
                  width={820}
                  height={328}
                  className="w-[280px] lg:w-[600px] brightness-0 invert"
                />
              </a>
              <div className="mt-0 flex items-end gap-2">
                <div className="text-2xl lg:text-4xl font-medium">On-Call Health</div>
                <Image
                  src="/images/on-call-health-logo.svg"
                  alt="On-Call Health"
                  width={40}
                  height={40}
                  className="w-6 h-6 lg:w-10 lg:h-10 brightness-0 invert mb-1"
                />
              </div>
              <div className="mt-8 text-sm text-slate-300">
                © Rootly {new Date().getFullYear()}. Licensed under <a href="https://github.com/Rootly-AI-Labs/On-Call-Health/blob/main/LICENSE" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Apache 2.0</a> · <a href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</a>
              </div>
            </div>


            <div className="flex items-center gap-3 mt-8">
              <a
                href="https://x.com/rootlyhq"
                target="_blank"
                rel="noreferrer"
                aria-label="Rootly on X"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20"
              >
                <div
                  className="h-4 w-4 text-white"
                  dangerouslySetInnerHTML={{ __html: siX.svg.replace(/<svg/, '<svg fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"').replace(/fill="[^"]*"/g, 'fill="currentColor"') }}
                />
              </a>
              <a
                href="https://www.linkedin.com/company/rootlyhq"
                target="_blank"
                rel="noreferrer"
                aria-label="Rootly on LinkedIn"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20"
              >
                <Linkedin className="h-6 w-6 text-white" />
              </a>
            </div>
          </div>



        </div>
      </footer>
    </div>
  )
}

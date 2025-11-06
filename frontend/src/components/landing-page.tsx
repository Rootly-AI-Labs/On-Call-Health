"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Link2, Brain, Target, Github, Chrome, Loader2, Flame } from "lucide-react";
import Image from "next/image"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// TODO: set the meta title and description - what's the right way of doing it?

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState<'google' | 'github' | null>(null)

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
      const data = await response.json()
      if (data.authorization_url) {
        window.location.href = data.authorization_url
      }
    } catch (error) {
      console.error('GitHub login error:', error)
      setIsLoading(null) // Reset loading state on error
    }
  }

  return (
    <div className="min-h-screen bg-white">

      {/* Hero Section */}
      <section className="bg-[url(/images/landing/rootly-bg.avif)] relative lg:pb-[120px]" id="get-started">
        {/* Header */}
        <div className="px-4 py-2">
          <div className="flex items-center">
            <div className="flex items-center">
              <div className="ml-2 mr-6 flex flex-col items-start -space-y-1">
                <a href="https://rootly.com" target="_blank">
                  <Image 
                    src="/images/rootly-ai-logo.png" 
                    alt="Rootly AI" 
                    width={321} 
                    height={129}
                    className="w-full"
                  />
                </a>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-lg leading-[1rem] lg:text-2xl font-semibold text-slate-900">On-call burnout detector</div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-300">
                  BETA
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="container flex flex-col lg:flex-row flex-grow mx-auto px-4">
          <main className="flex-grow px-5 lg:pr-10 text-white">
            <h1 className="text-3xl lg:text-5xl tracking-tight mb-6 leading-tight pt-10 lg:pt-20 lg:pb-1">
              Stop on-call burnout
              <br />
               before it starts.
            </h1>

            <p className="text-md lg:text-lg lg:pr-10">
              An open source, research-based tool that looks for early-warning signs of burnout in your on-call engineers.
            </p>

            {/* OAuth Login Buttons */}
            <p className="lg:text-lg font-semibold mt-10 lg:mt-20 mb-3">
              Get started with the burnout detector, it's free.
            </p>
            <div id="login" className="flex flex-col sm:flex-row gap-4 items-center mb-6">
              <Button
                size="lg"
                className="w-full rounded-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 text-lg"
                onClick={handleGitHubLogin}
                disabled={isLoading === 'github'}
              >
                {isLoading === 'github' ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    Connecting to GitHub...
                  </>
                ) : (
                  <>
                    <Github className="w-5 h-5 mr-3" />
                    Start with GitHub
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full rounded-full sm:w-auto border-slate-300 px-8 py-4 text-lg hover:bg-slate-50 bg-transparent"
                onClick={handleGoogleLogin}
                disabled={isLoading === 'google'}
              >
                {isLoading === 'google' ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    Connecting to Google...
                  </>
                ) : (
                  <>
                    <Chrome className="w-5 h-5 mr-3" />
                    Start with Google
                  </>
                )}
              </Button>
            </div>
          </main>
          <aside className="w-full">
            <Image 
              src="/images/landing/burnout-hero.png" 
              alt="Burnout detector screenshots" 
              width={1350} 
              height={1502}
              className="w-auto rounded-[28px]"
            />
          </aside>
        </div>
        <div className="w-full mb-[-1px] absolute h-[120px] bottom-0 left-0 z-0 lg:h-[250px] bg-[url(/images/landing/rootly-bg-gradient.avif)] bg-contain bg-repeat-x">

        </div>
      </section>

      {/* How It Works Section */}
      <section className="pt-8 pb-12 bg-white lg:pt-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-4">
            <h2 className="text-2xl md:text-3xl text-slate-900 mb-4">How it works</h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Based on scientifically validated burnout research methodology.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="bg-purple-25 border-none rounded-2xl">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-purple-100">
                  <Link2 className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Connect your incident tools.</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  Research shows a majority of on-call burnout risk can be predicted from incident history. Refine accuracy by connecting more tools.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">Start with Rootly or PagerDuty to feed incident data.</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">Add GitHub for code activity insights (optional).</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">Add Slack to explore communication patterns (optional).</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-25 border-none rounded-2xl">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-purple-100">
                  <Brain className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">See who’s at risk, backed by research.</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  The burnout detector calculates individual risk scores using our On-Call Burnout (OCB) score.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600"><strong>Low Risk (0-24):</strong> Maintain balance</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-slate-600"><strong>Moderate Risk (25-49):</strong> Monitor closely</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span className="text-slate-600"><strong>High Risk (50-74):</strong> Early intervention</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-slate-600"><strong>Critical Risk (75-100):</strong> Immediate action</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-purple-25 border-none rounded-2xl">
              <CardContent className="p-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-purple-100">
                  <Target className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-4">Access the results where you need them.</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  Make the burnout detector part of your powered workflow by getting the results via a UI, CLI, or MCP.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">Web UI for a simplified navigatoin</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">CLI to incorporate it in your toolchain</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-slate-600">MCP (Model Context Protocol) to make it part of your AI-powered workflow</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </section>
      <section>
        <div className="container mt-10">
          <div className="lg:columns-2 gap-12">
            <div className="py-10">
              <h2 className="text-2xl md:text-3xl text-slate-900 mb-4">Burnout signals, backed by data.</h2>
              <p className="mb-2">
                Our analysis combines workload pressure, after-hours activity, response time patterns, and communication sentiment to give a holistic view of burnout risk. 
              </p>
              <p>
                The system adapts to the tools you connect, delivering the most accurate insights possible.
              </p>
            </div>
            <Image 
              src="/images/landing/calculations.png" 
              alt="Screenshots of calculation schemes" 
              width={900} 
              height={500}
              className="w-full"
            />
          </div>
          <div className="lg:grid grid-cols-2 gap-12 mt-20">
            <div className="py-10 lg:order-last">
              <h2 className="text-2xl md:text-3xl text-slate-900 mb-4">For engineers, by engineers.</h2>
              <p className="mb-2">
                On-call engineers and SREs face a disproportionate risk of burnout. At Rootly, we want to help change that.
              </p>
              <p className="mb-2">That’s why we built this as <strong>open source</strong>, in the open, for the community.</p>
              <p>
                Spearheaded by Rootly AI Labs fellows Spencer Cheng and Sylvain Kalache, the project continues to evolve with contributions from engineers like you. Share feedback, file issues, or contribute code on GitHub—and help shape the future of burnout detection.
              </p>
            </div>
            <Image 
              src="/images/landing/open-source.png" 
              alt="Screenshots of the calculations" 
              width={900} 
              height={500}
              className="w-full"
            />
          </div>
          <div className="lg:columns-2 gap-12 mt-20">
            <div className="py-10">
              <h2 className="text-2xl md:text-3xl text-slate-900 mb-4">Hosted or self-hosted.</h2>
              <p className="mb-2">
                The Rootly Burnout Detector is open source, giving you full flexibility. Use the hosted web version for instant setup, or customize it to fit your workflow.</p>
              <p className="mb-2">That’s why we built this as open source, in the open, for the community.</p>
              <p>
Skip the UI and pull results directly into your CLI via MCP, or fork the code to support niche use cases. That’s the power of open source, adapt it to your team, your way.              </p>
            </div>
            <Image 
              src="/images/landing/views.png" 
              alt="Screenshots of web UI" 
              width={900} 
              height={500}
              className="w-full"
            />
          </div>
          <Card className="bg-purple-25 border-none rounded-2xl my-10 lg:my-20">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-purple-100">
                <Flame className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-2xl md:text-3xl text-slate-900 mb-6">Detect who’s at risk of burnout in your team.</h2>
              <div className="flex flex-col justify-center sm:flex-row gap-4 items-center mb-6">
                <a href="#get-started"
                  className="w-full rounded-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 text-lg"
                >
                  Get started
                </a>
                <a
                  href="https://github.com/Rootly-AI-Labs/rootly-burnout-detector-web/tree/main"
                  target="_blank"
                  className="w-full rounded-full sm:w-auto border-slate-300 px-8 py-4 text-lg hover:bg-slate-50 bg-transparent border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                >
                  <Github className="w-5 h-5 mr-3 inline-block" /> See project on GitHub 
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="bg-slate-900 text-slate-300 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <div className="flex items-center">
                  <a href="https://rootly.com" target="_blank" className="mr-6">
                    <Image 
                      src="/images/rootly-ai-logo.png" 
                      alt="Rootly AI" 
                      width={160} 
                      height={64}
                      className="w-full brightness-0 invert"
                    />
                  </a>
                <span className="text-lg leading-[1rem] lg:text-2xl font-semibold text-white">On-call burnout detector</span>
              </div>
            </div>

            <div className="flex items-center space-x-6 text-sm">
              <a href="mailto:spencer.cheng@rootly.com" className="hover:text-white transition-colors">
                Support
              </a>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-8 pt-8 text-center">
            <p className="text-slate-400">
              © {new Date().getFullYear()} Rootly, Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
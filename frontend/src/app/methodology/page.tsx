"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Activity,
  Timer,
  Target,
  Eye,
  MessageSquareHeart,
  GitCompare,
  Scale,
  Database,
  Heart
} from "lucide-react"
import Image from "next/image"
import { TopPanel } from "@/components/TopPanel"

// ============================================================================
// EDITABLE CONTENT - Modify text here without touching the component structure
// ============================================================================

const content = {
  // Page header
  header: {
    title: "On-Call Health Methodology",
    subtitle: "Research-enhanced health assessment with compound trauma, time impact, and recovery analysis",
  },

  // Goal and Role section - redesigned with cards
  goalAndRole: {
    title: "Goal and Role",
    description: "Understanding what On-Call Health does and how it works",

    // Main purpose card
    purpose: {
      icon: "Target",
      iconColor: "text-blue-600",
      title: "What On-Call Health Is For",
      description: `The goal of On-Call Health is to help incident management organizations maintain a healthy and sustainable on-call and workload balance for incident responders. Instead of reacting once people are already exhausted, the tool is designed to surface early signs that teams or individuals may be drifting into overload.`,
      callout: `On-Call Health is not a medical device and does not diagnose mental health conditions. Its role is to provide visibility into workload patterns and trends, so teams can notice issues sooner, ask better questions, and take corrective action before problems escalate.`,
      calloutColor: "blue",
    },

    // Two data types section
    dataTypes: {
      title: "Two Complementary Types of Data",
      description: "On-Call Health combines two categories of signals that serve different but complementary purposes.",
      types: [
        {
          icon: "Eye",
          iconColor: "text-blue-600",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          title: "Observed (Objective) Data",
          description: `We integrate with tools incident responders already use, such as incident management platforms, paging systems, and engineering workflows. Depending on the integrations enabled, this can include systems like Rootly, PagerDuty, Slack, GitHub, Linear, and Jira.`,
          question: "What is the current operational load on responders?",
          bullets: [
            "Number and severity of incidents handled",
            "Work occurring outside normal business hours",
            "Task volume and priority",
            "Sustained periods of elevated operational activity",
          ],
          footer: `These signals provide a concrete view of interruptions, pressure, and workload, but they are inherently incomplete on their own.`,
        },
        {
          icon: "MessageSquareHeart",
          iconColor: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          title: "Self-Reported Data",
          description: `Observed data cannot capture how someone is actually experiencing their workload. For that reason, On-Call Health also includes lightweight self-reported check-ins where responders can share how they're feeling.`,
          question: "How is the responder experiencing their current workload and stress level?",
          bullets: [
            "Regular wellness check-ins",
            "Subjective stress indicators",
            "Personal capacity feedback",
          ],
          footer: `This approach is inspired by simple practices used in healthcare, where subjective input is a critical signal. Even a short, regular check-in can add essential context to operational metrics and help distinguish between "busy but fine" and "busy and struggling."`,
        },
      ],
    },

    // Baselines card
    baselines: {
      icon: "GitCompare",
      iconColor: "text-orange-600",
      title: "Baselines and Trends, Not Absolutes",
      description: `A core design principle of On-Call Health is focusing on baselines and trends rather than absolute thresholds. This is intentional for several reasons:`,
      reasons: [
        { label: "Companies are different", detail: "Teams organize on-call, incident response, and workload in very different ways." },
        { label: "People are different", detail: "Some responders enjoy high-severity incidents or nighttime work; others find the same patterns draining." },
        { label: "Baseline mood varies", detail: "Some people naturally report feeling better or worse on an average day, independent of workload." },
        { label: "Change matters more than level", detail: "A negative trend relative to someone's own baseline is often a stronger signal that something may be wrong than any fixed number." },
        { label: "The goal is not comparison", detail: "On-Call Health is not designed to benchmark individuals or teams against each other." },
      ],
      footer: `By anchoring analysis to each team's and individual's historical baseline, the tool highlights meaningful deviations over time, rather than enforcing one-size-fits-all definitions of "too much."`,
    },

    // Absolute load note
    absoluteLoad: {
      icon: "Scale",
      iconColor: "text-neutral-600",
      title: "A Note on Absolute Load",
      paragraphs: [
        `In some cases, a team or individual's baseline may already be high when the tool is first introduced. For this reason, On-Call Health still provides ways to understand absolute workload and activity levels.`,
        `However, absolute load is not the primary focus. The main value of the tool lies in detecting trend drift—when something that used to be normal starts moving in an unhealthy direction.`,
      ],
    },
  },

  // Method overview section
  overview: {
    title: "The Method Behind <em>Risk Level</em>",
    description: "A baseline-driven overload signal inspired by established research",
    paragraphs: [
      `On-Call Health computes a composite signal called <strong>Risk Level</strong>, derived from multiple <strong>Risk Signals</strong> and designed for engineering on-call and incident response work. The scoring approach is informed by established workload and health research, adapted to operational telemetry rather than survey-only measurement. Risk Level is not a medical tool and should not be used for diagnosis—its purpose is to surface <strong>trend drift</strong> that may indicate unsustainable on-call load.`,
      `The composite signal incorporates factors such as incident volume and severity, after-hours and weekend interruptions, and sustained periods of elevated operational activity. These inputs are evaluated over time and interpreted relative to individual and team baselines, because what is "normal" varies significantly across organizations and responders.`,
    ],
    callout: `<strong>Multi-Source Analysis:</strong> On-Call Health can ingest signals from tools like Rootly and PagerDuty as primary sources, with additional context from GitHub, Slack, Linear, and Jira when available. The model adapts to whichever integrations you enable, providing visibility into workload patterns without requiring a single "perfect" data source.`,
  },

  // Key Workload Signals section
  factors: {
    title: "Risk Signals",
    intro: `On-Call Health analyzes a set of <strong>operational workload signals</strong> that commonly contribute to on-call overload. They are tracked over time and interpreted relative to <strong>individual and team baselines</strong> to surface meaningful changes.`,
    subintro: `Rather than assigning universal scores or "healthy" thresholds, the system focuses on <strong>trend drift</strong>—how patterns evolve compared to what is normal for a given team or responder.`,
    items: [
      {
        icon: "Activity",
        iconColor: "text-blue-500",
        title: "Incident Volume",
        description: `Tracks the frequency of incidents handled over time. Sustained increases in incident volume often indicate rising operational load and reduced opportunity for recovery, especially when combined with other signals.`,
        question: `Is the number of interruptions increasing relative to what's normal for this team or individual?`,
      },
      {
        icon: "Clock",
        iconColor: "text-orange-500",
        title: "Off-Hours Activity",
        description: `Captures work performed outside normal working hours, including evenings, nights, and weekends. This includes incident responses as well as related operational activity. Persistent off-hours work can reduce recovery time and contribute to cumulative fatigue, especially when it becomes a consistent pattern rather than an exception.`,
        detail: `<strong>How We Determine Off-Hours:</strong> On-Call Health retrieves each user's timezone from their Rootly or PagerDuty profile settings (with Rootly taking priority). Activities are then evaluated against standard business hours (9 AM to 5 PM by default) in the user's local timezone. This ensures that an engineer in San Francisco and one in Paris are both correctly assessed based on their respective local times. The business hours thresholds are configurable via environment variables for organizations with non-standard working hours.`,
        question: `Is off-hours work increasing or becoming more frequent compared to the historical baseline?`,
      },
      {
        icon: "Timer",
        iconColor: "text-red-500",
        title: "Response-Time Pressure",
        description: `Reflects the urgency and frequency of rapid responses required during incidents. While fast response is often necessary, sustained pressure to respond immediately can increase stress and cognitive load.`,
        detail: `Rather than enforcing a fixed response-time threshold, On-Call Health looks at how response patterns change over time for a given responder or team.`,
        question: `Is the pressure to respond quickly increasing or becoming more sustained over time?`,
      },
      {
        icon: "TrendingUp",
        iconColor: "text-purple-500",
        title: "Severity-Weighted Incident Load",
        description: `Accounts for the fact that not all incidents carry the same operational and cognitive burden. Higher-severity incidents generally demand more attention, longer focus, and greater emotional investment than lower-severity events.`,
        question: `Is the proportion of high-severity incidents increasing relative to normal patterns?`,
      },
    ],
    conclusion: {
      title: "How These Signals Are Used",
      description: `These signals are combined into a <strong>composite workload view</strong> and evaluated relative to historical baselines. The goal is to reduce noise and highlight changes that may warrant attention, not to label or rank individuals.`,
      callout: `A sustained negative trend across one or more signals—especially when combined with changes in self-reported check-ins—can indicate that on-call load is becoming unsustainable and may require investigation or adjustment.`,
    },
  },

  // Research enhancements section
  enhancements: {
    title: "Risk Level Formula",
    intro: `The Risk Level is a metric specific to On-Call Health—it is not a clinically validated health metric or diagnostic tool. We took inspiration from research-led frameworks (including first responder stress studies) and adapted them to the specific needs of incident responders. We share this methodology so you have full clarity on how scores are calculated. Since On-Call Health is open source, you're free to adjust the weights and thresholds to fit your team's needs.`,
    items: [
      {
        icon: "AlertTriangle",
        iconColor: "text-red-600",
        title: "Compound Trauma Factor",
        description: `Research shows that multiple critical incidents create exponential psychological impact, not just additive impact. When a team member handles 5+ SEV0/SEV1 incidents, the psychological burden compounds significantly beyond simple addition.`,
        researchBasis: `First responder studies show 5+ critical incidents create 25.6x higher PTSD probability. Multiple critical incidents cause compound trauma, not linear stress accumulation.`,
        researchColor: "red",
        detail: `<strong>Scoring:</strong> 5-10 critical incidents: 1.10-1.20x multiplier • 10+ critical incidents: 1.15x per additional incident (capped at 2.0x total)`,
      },
      {
        icon: "Clock",
        iconColor: "text-orange-600",
        title: "Time Impact Multipliers",
        description: `Research demonstrates that incident timing dramatically affects psychological impact. After-hours, weekend, and overnight incidents cause significantly higher stress due to circadian disruption, family time interference, and sleep disturbance.`,
        researchBasis: `Studies on circadian disruption and work-life boundary violations show timing creates multiplicative stress effects, not additive ones.`,
        researchColor: "orange",
        timeImpacts: [
          { label: "After-Hours", multiplier: "1.4x psychological impact", note: "(Before 9am / After 5pm in user's timezone)" },
          { label: "Weekend", multiplier: "1.6x psychological impact", note: "(Family time disruption)" },
          { label: "Overnight", multiplier: "1.8x psychological impact", note: "(Sleep disruption: 10pm-6am in user's timezone)" },
        ],
      },
      {
        icon: "Timer",
        iconColor: "text-blue-600",
        title: "Recovery Deficit Analysis",
        description: `Psychological recovery research shows that insufficient time between stressful incidents prevents proper mental restoration. Recovery periods under 48 hours significantly impair the brain's ability to process and recover from traumatic stress.`,
        researchBasis: `Trauma psychology research demonstrates that recovery periods <48 hours prevent psychological restoration, leading to stress accumulation and increased health risk.`,
        researchColor: "blue",
        detail: `<strong>Scoring:</strong> Recovery Score 0-100 (higher = better) • Perfect recovery: 168+ hours between incidents • Each violation (<48 hours) reduces recovery adequacy • Sustained violations indicate chronic stress`,
      },
    ],
  },

  // Dimensions section
  dimensions: {
    title: "On-Call Health Dimensions (OCH Methodology)",
    description: "Two dimensions specifically adapted for software engineers on-call work",
    items: [
      {
        color: "red",
        title: "Personal Wellbeing (65% weight)",
        description: `Physical and psychological fatigue and exhaustion experienced by the person. This dimension measures recovery time interference, work-life balance erosion, and psychological impact from high-stress incidents.`,
        calculation: "After-Hours Activity (30%) + High-Severity Incident Impact (25%) + Task Load (10%)",
      },
      {
        color: "yellow",
        title: "Work-Related Wellbeing (35% weight)",
        description: `Fatigue and exhaustion specifically attributed to work demands. This dimension captures on-call burden, sustained stress from consecutive incident days, and workload pressure.`,
        calculation: "On-Call Load (20%) + Consecutive Incident Days (15%)",
      },
    ],
    footer: `<strong>Final Score:</strong> The two dimensions are weighted and combined to produce a final health score from 0-100, with higher scores indicating greater health risk. The OCH methodology reflects research showing that personal factors (work-life balance) contribute more to health risk than work-specific factors alone.`,
  },
}

// ============================================================================
// COMPONENT - Renders the content above (no need to edit below for text changes)
// ============================================================================

const iconMap = {
  Activity: Activity,
  Clock: Clock,
  AlertTriangle: AlertTriangle,
  Timer: Timer,
  TrendingUp: TrendingUp,
  Target: Target,
  Eye: Eye,
  MessageSquareHeart: MessageSquareHeart,
  GitCompare: GitCompare,
  Scale: Scale,
  Database: Database,
  Heart: Heart,
}

// Define sections for the outline navigation
const sections = [
  { id: "goal-and-role", title: "Goal and Role" },
  { id: "method", title: "The Method Behind Risk Level" },
  { id: "workload-signals", title: "Risk Signals" },
  { id: "research-enhancements", title: "Risk Level Formula" },
  { id: "health-dimensions", title: "Health Dimensions" },
]

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <TopPanel />
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black mb-2">{content.header.title}</h1>
          <p className="text-lg text-neutral-700">{content.header.subtitle}</p>
        </div>

        <div className="flex gap-8">
          {/* Left Sidebar - Outline Navigation */}
          <nav className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-8">
              <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">On this page</h3>
              <ul className="space-y-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 rounded-sm px-3 py-2 transition-colors"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Main Content */}
          <div className="flex-1 max-w-4xl">
            {/* Goal and Role Section - Redesigned */}
            <div id="goal-and-role" className="mb-8 flex flex-col gap-6 scroll-mt-8">
          <h2 className="text-3xl font-semibold text-neutral-900">{content.goalAndRole.title}</h2>
          <p className="text-base text-neutral-700">{content.goalAndRole.description}</p>

          {/* Purpose Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2 text-blue-600" />
                {content.goalAndRole.purpose.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-neutral-700 mb-4">{content.goalAndRole.purpose.description}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">{content.goalAndRole.purpose.callout}</p>
              </div>
            </CardContent>
          </Card>

          {/* Two Data Types */}
          <h2 className="text-2xl font-semibold text-neutral-900">{content.goalAndRole.dataTypes.title}</h2>
          <p className="text-base text-neutral-700">{content.goalAndRole.dataTypes.description}</p>
          <Card>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {content.goalAndRole.dataTypes.types.map((type, idx) => {
                  const IconComponent = iconMap[type.icon as keyof typeof iconMap]
                  return (
                    <div key={idx} className={`${type.bgColor} ${type.borderColor} border rounded-lg p-4`}>
                      <div className="flex items-center mb-3">
                        <IconComponent className={`w-5 h-5 mr-2 ${type.iconColor}`} />
                        <h4 className="font-semibold text-neutral-900">{type.title}</h4>
                      </div>
                      <p className="text-sm text-neutral-700 mb-3">{type.description}</p>
                      <div className="bg-white/60 rounded-sm p-2 mb-3">
                        <p className="text-sm font-medium text-neutral-800">
                          Core question: <em>{type.question}</em>
                        </p>
                      </div>
                      <ul className="text-sm text-neutral-600 space-y-1 mb-3">
                        {type.bullets.map((bullet, bIdx) => (
                          <li key={bIdx} className="flex items-start">
                            <span className="mr-2">•</span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-neutral-500 italic">{type.footer}</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Baselines Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitCompare className="w-5 h-5 mr-2 text-orange-600" />
                {content.goalAndRole.baselines.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-neutral-700 mb-4">{content.goalAndRole.baselines.description}</p>
              <div className="space-y-3 mb-4">
                {content.goalAndRole.baselines.reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start bg-orange-50 border border-orange-100 rounded-lg p-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full mt-2 mr-3 shrink-0"></div>
                    <div>
                      <span className="font-medium text-neutral-900">{reason.label}.</span>{" "}
                      <span className="text-neutral-700">{reason.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-neutral-100 rounded-lg p-4">
                <p className="text-sm text-neutral-700">{content.goalAndRole.baselines.footer}</p>
              </div>
            </CardContent>
          </Card>

          {/* Absolute Load Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Scale className="w-5 h-5 mr-2 text-neutral-600" />
                {content.goalAndRole.absoluteLoad.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {content.goalAndRole.absoluteLoad.paragraphs.map((p, idx) => (
                <p key={idx} className="text-base text-neutral-700 mb-3 last:mb-0">{p}</p>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Overview */}
        <Card id="method" className="mb-8 scroll-mt-8">
          <CardHeader>
            <CardTitle dangerouslySetInnerHTML={{ __html: content.overview.title }} />
            <CardDescription>{content.overview.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {content.overview.paragraphs.map((p, idx) => (
              <p key={idx} className="text-base text-neutral-700 mb-4" dangerouslySetInnerHTML={{ __html: p }} />
            ))}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-base text-blue-800" dangerouslySetInnerHTML={{ __html: content.overview.callout }} />
            </div>
          </CardContent>
        </Card>

        {/* Key Workload Signals */}
        <div id="workload-signals" className="mb-8 flex flex-col gap-6 scroll-mt-8">
          <h2 className="text-3xl font-semibold text-neutral-900">{content.factors.title}</h2>
          <p className="text-base text-neutral-700" dangerouslySetInnerHTML={{ __html: content.factors.intro }} />
          <p className="text-base text-neutral-700" dangerouslySetInnerHTML={{ __html: content.factors.subintro || '' }} />

          {content.factors.items.map((factor, idx) => {
            const IconComponent = iconMap[factor.icon as keyof typeof iconMap]
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <IconComponent className={`w-5 h-5 mr-2 ${factor.iconColor}`} />
                    {factor.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base text-neutral-700 mb-3">{factor.description}</p>
                  {factor.detail && (
                    <div className="bg-neutral-100 rounded-lg p-3 mb-3">
                      <p className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: factor.detail }} />
                    </div>
                  )}
                  {factor.question && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>This signal helps answer:</strong> <em>{factor.question}</em>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Conclusion - Different design as summary section */}
          {content.factors.conclusion && (
            <div className="bg-linear-to-r from-blue-50 to-neutral-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="bg-blue-100 rounded-full p-3 shrink-0">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-neutral-900 mb-3">{content.factors.conclusion.title}</h3>
                  <p className="text-base text-neutral-700 mb-3" dangerouslySetInnerHTML={{ __html: content.factors.conclusion.description }} />
                  <p className="text-base text-neutral-700">{content.factors.conclusion.callout}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Research-Based Enhancements */}
        <div id="research-enhancements" className="mb-8 flex flex-col gap-6 scroll-mt-8">
          <h2 className="text-3xl font-semibold text-neutral-900">{content.enhancements.title}</h2>
          <p className="text-base text-neutral-700">{content.enhancements.intro}</p>

          {content.enhancements.items.map((item, idx) => {
            const IconComponent = iconMap[item.icon as keyof typeof iconMap]
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <IconComponent className={`w-5 h-5 mr-2 ${item.iconColor}`} />
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base text-neutral-700 mb-3">{item.description}</p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-blue-800">
                      <strong>Research Basis:</strong> {item.researchBasis}
                    </p>
                  </div>
                  {item.timeImpacts ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {item.timeImpacts.map((impact, impactIdx) => (
                        <div key={impactIdx} className="bg-neutral-100 rounded-lg p-3">
                          <p className="text-sm text-neutral-700">
                            <strong>{impact.label}:</strong><br />
                            {impact.multiplier}<br />
                            <span className="text-neutral-500">{impact.note}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-neutral-100 rounded-lg p-3">
                      <p className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: item.detail || '' }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Three Dimensions */}
        <Card id="health-dimensions" className="mb-8 scroll-mt-8">
          <CardHeader>
            <CardTitle>{content.dimensions.title}</CardTitle>
            <CardDescription>{content.dimensions.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              {content.dimensions.items.map((dim, idx) => {
                const colorClasses: Record<string, { dot: string; bg: string; border: string; text: string }> = {
                  red: { dot: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
                  yellow: { dot: 'bg-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
                  blue: { dot: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
                }
                const colors = colorClasses[dim.color] || colorClasses.blue
                return (
                  <div key={idx}>
                    <h4 className="font-semibold text-neutral-900 mb-2 flex items-center">
                      <div className={`w-4 h-4 ${colors.dot} rounded-sm mr-2`}></div>
                      {dim.title}
                    </h4>
                    <p className="text-sm text-neutral-700 mb-3">{dim.description}</p>
                    <div className={`${colors.bg} ${colors.border} border rounded-lg p-3`}>
                      <p className={`text-xs ${colors.text}`}>
                        <strong>Calculation:</strong> {dim.calculation}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
                <p className="text-sm text-neutral-700" dangerouslySetInnerHTML={{ __html: content.dimensions.footer }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Powered by Rootly AI Footer */}
        <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
          <a
            href="https://rootly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-col items-center space-y-1 hover:opacity-80 transition-opacity"
          >
            <span className="text-lg text-neutral-700">powered by</span>
            <Image
              src="/images/rootly-ai-logo.png"
              alt="Rootly AI"
              width={200}
              height={80}
              className="h-12 w-auto"
            />
          </a>
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}

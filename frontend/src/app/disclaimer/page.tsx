"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertTriangle,
  FileText,
  Heart,
  Scale,
  Code,
  ShieldX,
  Info,
} from "lucide-react"
import Image from "next/image"
import { TopPanel } from "@/components/TopPanel"

// ============================================================================
// EDITABLE CONTENT - Modify text here without touching the component structure
// ============================================================================

const content = {
  header: {
    title: "Disclaimer",
    subtitle: "Important information about On-Call Health and its intended use",
  },

  sections: [
    {
      id: "not-production",
      icon: "Code",
      iconColor: "text-blue-600",
      title: "Open Source Project",
      description: `On-Call Health is an open source project provided "as is" without warranty of any kind. This software is intended for educational, research, and experimental purposes.`,
      callout: {
        type: "warning",
        text: `This project is not intended for production use. Organizations choosing to deploy this software do so at their own risk and should conduct their own security, compliance, and reliability assessments before any production deployment.`,
      },
      bullets: [
        "Source code is publicly available on GitHub",
        "Community contributions are welcome",
        "No guarantees of availability, performance, or security",
        "Users are responsible for their own deployments and data",
      ],
    },
    {
      id: "no-sla",
      icon: "ShieldX",
      iconColor: "text-orange-600",
      title: "Not Covered by Rootly SLAs or Terms",
      description: `On-Call Health is a separate open source initiative and is not part of Rootly's commercial product offerings.`,
      callout: {
        type: "info",
        text: `This project is not covered by Rootly's Service Level Agreements (SLAs), Terms and Conditions, or support commitments. Any use of On-Call Health is independent of your Rootly subscription or agreement.`,
      },
      bullets: [
        "No SLA guarantees for uptime or availability",
        "No commercial support provided",
        "Not covered by Rootly's Terms of Service",
        "No data processing agreements apply",
        "Issues should be reported via GitHub, not Rootly support channels",
      ],
    },
    {
      id: "not-medical",
      icon: "Heart",
      iconColor: "text-red-600",
      title: "Not a Medical or Diagnostic Tool",
      description: `On-Call Health is designed to provide visibility into workload patterns and operational metrics. It does not diagnose, treat, prevent, or cure any medical condition.`,
      callout: {
        type: "critical",
        text: `On-Call Health is not a medical device, clinical tool, or diagnostic instrument. The "Risk Level" and other metrics are operational indicators only—they do not constitute medical advice, diagnosis, or treatment recommendations. Do not use this tool as a substitute for professional medical judgment.`,
      },
      bullets: [
        "Metrics are operational indicators, not clinical assessments",
        "\"Risk Level\" refers to operational workload risk, not health diagnosis",
        "Does not diagnose burnout, mental health conditions, or any medical state",
        "Should not replace conversations with healthcare professionals",
        "Intended to surface workload trends for management review, not clinical intervention",
      ],
    },
    {
      id: "intended-use",
      icon: "Info",
      iconColor: "text-purple-600",
      title: "Intended Use",
      description: `On-Call Health is designed to help engineering teams and managers gain visibility into on-call workload patterns and trends.`,
      bullets: [
        "Surface early indicators of potential workload imbalance",
        "Provide data to inform team discussions about on-call sustainability",
        "Help organizations track operational load over time",
        "Support proactive workload management decisions",
      ],
      footer: `The tool provides indications and signals based on operational data. All decisions regarding team health, workload adjustments, and personnel matters should be made by qualified individuals using their professional judgment and appropriate organizational processes.`,
    },
    {
      id: "limitation-liability",
      icon: "Scale",
      iconColor: "text-neutral-600",
      title: "Limitation of Liability",
      description: `To the fullest extent permitted by applicable law, Rootly Inc. and the contributors to this project disclaim all liability for any damages arising from the use of On-Call Health.`,
      bullets: [
        "No liability for decisions made based on tool output",
        "No liability for data loss, security incidents, or system failures",
        "No liability for any indirect, incidental, or consequential damages",
        "Users assume all risk associated with use of this software",
      ],
    },
  ],

  footer: {
    text: `By using On-Call Health, you acknowledge that you have read and understood this disclaimer. If you have questions about Rootly's commercial products and their terms, please visit`,
    linkText: "rootly.com",
    linkUrl: "https://rootly.com",
  },
}

// ============================================================================
// COMPONENT - Renders the content above
// ============================================================================

const iconMap = {
  AlertTriangle: AlertTriangle,
  FileText: FileText,
  Heart: Heart,
  Scale: Scale,
  Code: Code,
  ShieldX: ShieldX,
  Info: Info,
}

const sections = content.sections.map((section) => ({
  id: section.id,
  title: section.title,
}))

export default function DisclaimerPage() {
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
                      className="block text-sm text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 rounded px-3 py-2 transition-colors"
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
            {/* Important Notice Banner */}
            <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="bg-amber-100 rounded-full p-3 shrink-0">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-amber-900 mb-2">Important Notice</h2>
                  <p className="text-amber-800">
                    On-Call Health is an open source project provided for informational and experimental purposes only.
                    It is not a medical tool, is not covered by Rootly&apos;s commercial terms, and is not intended for production use.
                    Please read this disclaimer carefully before using the software.
                  </p>
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-6">
              {content.sections.map((section) => {
                const IconComponent = iconMap[section.icon as keyof typeof iconMap]

                const calloutStyles: Record<string, { bg: string; border: string; text: string }> = {
                  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
                  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800" },
                  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800" },
                }

                return (
                  <Card key={section.id} id={section.id} className="scroll-mt-8">
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <IconComponent className={`w-5 h-5 mr-2 ${section.iconColor}`} />
                        {section.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-base text-neutral-700 mb-4">{section.description}</p>

                      {section.callout && (
                        <div className={`${calloutStyles[section.callout.type].bg} ${calloutStyles[section.callout.type].border} border rounded-lg p-4 mb-4`}>
                          <p className={`text-sm ${calloutStyles[section.callout.type].text}`}>
                            {section.callout.text}
                          </p>
                        </div>
                      )}

                      {section.bullets && (
                        <ul className="space-y-2 mb-4">
                          {section.bullets.map((bullet, idx) => (
                            <li key={idx} className="flex items-start text-neutral-700">
                              <span className="mr-3 text-neutral-400">•</span>
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.footer && (
                        <div className="bg-neutral-100 rounded-lg p-4">
                          <p className="text-sm text-neutral-700">{section.footer}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
              <p className="text-neutral-600 mb-4">
                {content.footer.text}{" "}
                <a
                  href={content.footer.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-700 hover:text-purple-800 underline"
                >
                  {content.footer.linkText}
                </a>
                .
              </p>
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

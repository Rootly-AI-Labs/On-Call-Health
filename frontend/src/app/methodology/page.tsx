"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, TrendingUp, Clock, AlertTriangle, Activity, Timer } from "lucide-react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { TopPanel } from "@/components/TopPanel"

export default function MethodologyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <TopPanel />
      <div className="max-w-4xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black mb-2">
            Enhanced Burnout Methodology
          </h1>
          <p className="text-lg text-gray-600">
            Research-enhanced Copenhagen Burnout Inventory with compound trauma, time impact, and recovery analysis
          </p>
        </div>

        {/* Overview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>The Science Behind Our Scoring</CardTitle>
            <CardDescription>
              Powered by the On-Call Burnout (OCB) Score — inspired by the Copenhagen Burnout Inventory (CBI)
            </CardDescription>
          </CardHeader>

          <CardContent>
            <p className="text-base text-gray-700 mb-4">
              Our burnout detection system uses the <strong>On-Call Burnout (OCB) Score</strong>, a model designed specifically for
              engineering on-call work and incident response environments. The OCB framework is
              inspired by the Copenhagen Burnout Inventory (CBI), a scientifically validated tool for measuring personal and
              work-related burnout, but adapts those principles to operational data rather than survey responses.
              <br /><br />
              The OCB Score incorporates factors such as severity-weighted incident load, after-hours and weekend work,
              response-time pressure, recovery gaps between incidents, and compound-trauma effects from repeated critical events.
              This produces a real-time, practical burnout indicator tailored for modern DevOps and SRE teams.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-base text-blue-800">
                <strong>Multi-Source Analysis:</strong> We analyze incident data from PagerDuty/Rootly as the primary source,
                with additional insights from GitHub activity patterns and Slack communication when available.
                The system adapts based on available integrations to provide the most comprehensive assessment possible.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Burnout Factors */}
        <div className="space-y-6 mb-8">
          <h2 className="text-3xl font-semibold text-gray-900">The Five Key Burnout Factors</h2>

          <p className="text-base text-gray-700 mb-6">
            We analyze five specific factors that contribute to burnout in incident response teams. Each factor is measured
            on a scale of 0-10, with higher scores indicating greater burnout risk. These factors are then combined using
            the three-dimensional Copenhagen Burnout Inventory framework to produce an overall burnout score.
          </p>

          {/* Workload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2 text-red-500" />
                Workload Factor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Measures the frequency and volume of incidents handled by each team member over time.
                This is one of the strongest predictors of burnout, as high incident volumes can lead to
                chronic stress and exhaustion.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Scoring:</strong> 0-2 incidents/week = Low (0-3 points) • 2-5 incidents/week = Moderate (3-7 points) •
                  5-8 incidents/week = High (7-10 points) • 8+ incidents/week = Critical (10 points)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* After Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-orange-500" />
                After Hours Factor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Tracks work performed outside normal business hours, including incident responses, code commits,
                and team communications. Excessive after-hours work disrupts work-life balance and contributes
                to emotional exhaustion.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Data Sources:</strong> Incident timestamps from PagerDuty/Rootly, GitHub commit times,
                  and Slack message activity (when connected)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Weekend Work */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
                Weekend Work Factor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Measures weekend activity that disrupts personal time and recovery periods. Regular weekend work
                prevents proper rest and contributes to chronic stress accumulation, leading to depersonalization
                and cynicism toward work.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Boundary Health:</strong> Healthy teams typically have &lt;10% weekend activity.
                  Scores above 25% indicate significant work-life boundary violations.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Response Time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Timer className="w-5 h-5 mr-2 text-blue-500" />
                Response Time Pressure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Measures the time pressure to respond quickly to incidents. While fast response times are important
                for business continuity, excessive pressure to respond immediately can create chronic stress and
                contribute to feelings of being overwhelmed and losing control.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Pressure Points:</strong> Average response time under 5 minutes indicates high pressure.
                  Sustained pressure can lead to anxiety and reduced job satisfaction.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Incident Load */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-purple-500" />
                Severity-Weighted Incident Load
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Goes beyond simple incident count to measure the actual psychological burden of different incident
                severities. Critical incidents (SEV0/SEV1) cause significantly more stress than minor issues,
                so this factor weights incidents by their business impact and stress level.
              </p>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Research-Based Severity Weighting:</strong> SEV0/Critical = 15x weight • SEV1/High = 12x weight •
                  Medium = 6x weight • Low = 3x weight. These weights reflect the psychological impact of
                  critical incidents based on first responder PTSD research.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Research-Based Enhancements */}
        <div className="space-y-6 mb-8">
          <h2 className="text-3xl font-semibold text-gray-900">Research-Based Scoring Enhancements</h2>

          <p className="text-base text-gray-700 mb-6">
            Based on 2024 research from ACM studies on cybersecurity incident burnout, first responder PTSD research,
            and critical incident stress psychology, we've enhanced our scoring with three key improvements that capture
            the true psychological impact of incident response work.
          </p>

          {/* Compound Trauma */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                Compound Trauma Factor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Research shows that multiple critical incidents create exponential psychological impact, not just additive impact.
                When a team member handles 5+ SEV0/SEV1 incidents, the psychological burden compounds significantly beyond
                simple addition.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-red-800">
                  <strong>Research Basis:</strong> First responder studies show 5+ critical incidents create 25.6x higher PTSD probability.
                  Multiple critical incidents cause compound trauma, not linear stress accumulation.
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Scoring:</strong> 5-10 critical incidents: 1.10-1.20x multiplier • 10+ critical incidents:
                  1.15x per additional incident (capped at 2.0x total)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Time Impact Multipliers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="w-5 h-5 mr-2 text-orange-600" />
                Time Impact Multipliers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Research demonstrates that incident timing dramatically affects psychological impact. After-hours, weekend,
                and overnight incidents cause significantly higher stress due to circadian disruption, family time interference,
                and sleep disturbance.
              </p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-orange-800">
                  <strong>Research Basis:</strong> Studies on circadian disruption and work-life boundary violations show
                  timing creates multiplicative stress effects, not additive ones.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">
                    <strong>After-Hours:</strong><br/>
                    1.4x psychological impact<br/>
                    <span className="text-gray-500">(Before 8am / After 6pm)</span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">
                    <strong>Weekend:</strong><br/>
                    1.6x psychological impact<br/>
                    <span className="text-gray-500">(Family time disruption)</span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">
                    <strong>Overnight:</strong><br/>
                    1.8x psychological impact<br/>
                    <span className="text-gray-500">(Sleep disruption: 11pm-6am)</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recovery Deficit Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Timer className="w-5 h-5 mr-2 text-blue-600" />
                Recovery Deficit Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base text-gray-700 mb-3">
                Psychological recovery research shows that insufficient time between stressful incidents prevents proper
                mental restoration. Recovery periods under 48 hours significantly impair the brain's ability to process
                and recover from traumatic stress.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-blue-800">
                  <strong>Research Basis:</strong> Trauma psychology research demonstrates that recovery periods &lt;48 hours
                  prevent psychological restoration, leading to stress accumulation and increased burnout risk.
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>Scoring:</strong> Recovery Score 0-100 (higher = better) • Perfect recovery: 168+ hours between incidents •
                  Each violation (&lt;48 hours) reduces recovery adequacy • Sustained violations indicate chronic stress
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Three Dimensions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>On-Call Burnout Dimensions</CardTitle>
            <CardDescription>
              How the five factors map to the three scientifically validated burnout dimensions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
                  Emotional Exhaustion (40% weight)
                </h4>
                <p className="text-sm text-gray-700 mb-3">
                  Physical and psychological fatigue from work demands. This dimension measures the core stress
                  experience and depletion of emotional resources that characterizes burnout.
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-800">
                    <strong>Calculation:</strong> Workload Factor (50%) + After Hours Factor (30%) + Incident Load (20%)
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
                  Depersonalization/Cynicism (30% weight)
                </h4>
                <p className="text-sm text-gray-700 mb-3">
                  Detached, callous attitudes toward work and colleagues. This reflects the psychological
                  distancing and defensive coping mechanisms that develop under chronic stress.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <strong>Calculation:</strong> Response Time Pressure (50%) + Weekend Work Factor (50%)
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
                  Reduced Personal Accomplishment (30% weight)
                </h4>
                <p className="text-sm text-gray-700 mb-3">
                  Feelings of ineffectiveness and lack of achievement at work. This dimension captures
                  the erosion of professional self-efficacy and satisfaction with one's contributions.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Calculation:</strong> Inverted measure of effectiveness under pressure, derived from
                    response time pressure and incident load factors.
                  </p>
                </div>
              </div>

              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <strong>Final Score:</strong> The three dimensions are weighted and combined to produce a final
                  burnout score from 0-100, with higher scores indicating greater burnout risk. The weighting
                  reflects the relative importance of each dimension based on burnout research.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced User Insights */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Enhanced User Insights</CardTitle>
            <CardDescription>
              Research-based insights now displayed to users for better understanding and actionability
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              Beyond traditional burnout factors, users now see detailed research-based insights that explain
              the specific stress patterns affecting their team members. These insights help identify root causes
              and provide actionable intervention points.
            </p>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-800 mb-2">Time Impact Factors</h4>
                <div className="text-sm text-red-700 space-y-1">
                  <p>• Non-business hours incidents: 8 (1.4x psychological impact)</p>
                  <p>• Weekend incidents disrupting family time: 3 (1.6x impact)</p>
                  <p>• Overnight incidents disrupting sleep: 2 (1.8x impact)</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Recovery Deficit Factors</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>• Insufficient recovery periods: 5 violations (&lt;48 hours between incidents)</p>
                  <p>• Average recovery time: 18.3 hours (optimal: 168+ hours)</p>
                  <p>• Recovery adequacy: 23/100 (psychological restoration impaired)</p>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="font-semibold text-orange-800 mb-2">Compound Trauma Factors</h4>
                <div className="text-sm text-orange-700 space-y-1">
                  <p>• Multiple critical incidents: 13 (compound factor: 1.45x)</p>
                  <p>• Research shows: 5+ critical incidents create exponential psychological impact</p>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>Actionable Intelligence:</strong> These insights help managers understand not just
                <em>that</em> someone is at burnout risk, but <em>why</em> and <em>what specific factors</em>
                are driving the risk. This enables targeted interventions rather than generic wellness approaches.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Risk Levels */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Risk Level Classification</CardTitle>
            <CardDescription>
              How we categorize burnout risk and what each level means for team intervention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-4 mb-2">
                  <Badge className="bg-green-500 w-24">Low Risk</Badge>
                  <Progress value={20} className="h-3 flex-1" />
                  <span className="text-sm font-medium">0-24 points</span>
                </div>
                <p className="text-sm text-gray-600 ml-28">
                  Sustainable workload and healthy work-life balance. Team members are functioning well
                  with minimal stress indicators. Continue current practices and monitor for changes.
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-4 mb-2">
                  <Badge className="bg-yellow-500 w-24">Moderate</Badge>
                  <Progress value={37} className="h-3 flex-1" />
                  <span className="text-sm font-medium">25-49 points</span>
                </div>
                <p className="text-sm text-gray-600 ml-28">
                  Some stress indicators present but manageable. Consider workload distribution,
                  schedule adjustments, or additional support. Monitor closely for escalation.
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-4 mb-2">
                  <Badge className="bg-orange-500 w-24">High Risk</Badge>
                  <Progress value={62} className="h-3 flex-1" />
                  <span className="text-sm font-medium">50-74 points</span>
                </div>
                <p className="text-sm text-gray-600 ml-28">
                  Significant burnout indicators requiring intervention. Recommend workload reduction,
                  schedule changes, additional team support, or temporary assignment adjustments.
                </p>
              </div>

              <div>
                <div className="flex items-center space-x-4 mb-2">
                  <Badge className="bg-red-500 w-24">Critical</Badge>
                  <Progress value={87} className="h-3 flex-1" />
                  <span className="text-sm font-medium">75-100 points</span>
                </div>
                <p className="text-sm text-gray-600 ml-28">
                  Severe burnout risk requiring immediate action. Consider temporary on-call rotation
                  removal, significant workload reduction, or professional support resources.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
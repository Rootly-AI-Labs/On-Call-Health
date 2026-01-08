"use client"

import { LineChart, Line, ResponsiveContainer } from "recharts"

interface SurveySparklineProps {
  surveyData: {
    combined_score: number
    submitted_at: string
  }[]
  width?: number
  height?: number
  color?: string
}

export function SurveySparkline({
  surveyData,
  width = 60,
  height = 20,
  color = "#8b5cf6"
}: SurveySparklineProps) {
  if (!surveyData || surveyData.length === 0) {
    return null
  }

  // Transform data for chart (combined_score is 1-5 scale)
  const chartData = surveyData.map((survey) => ({
    score: survey.combined_score
  }))

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="score"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

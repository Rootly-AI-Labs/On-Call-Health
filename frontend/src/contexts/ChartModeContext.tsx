"use client"

import { createContext, useContext, useState, ReactNode } from "react"

type ChartMode = "normal" | "running_average"

interface ChartModeContextType {
  chartMode: ChartMode
  setChartMode: (mode: ChartMode) => void
}

const ChartModeContext = createContext<ChartModeContextType | undefined>(undefined)

export function ChartModeProvider({ children }: { children: ReactNode }) {
  const [chartMode, setChartMode] = useState<ChartMode>("normal")

  return (
    <ChartModeContext.Provider value={{ chartMode, setChartMode }}>
      {children}
    </ChartModeContext.Provider>
  )
}

export function useChartMode() {
  const context = useContext(ChartModeContext)
  if (context === undefined) {
    throw new Error("useChartMode must be used within ChartModeProvider")
  }
  return context
}

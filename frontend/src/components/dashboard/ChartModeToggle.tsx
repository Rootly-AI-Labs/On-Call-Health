"use client"

import { useChartMode } from "@/contexts/ChartModeContext"
import { Button } from "@/components/ui/button"

export function ChartModeToggle() {
  const { chartMode, setChartMode } = useChartMode()

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-neutral-700">Chart Mode:</span>
      <div className="flex gap-2">
        <Button
          variant={chartMode === 'normal' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartMode('normal')}
          className="h-8 px-3"
        >
          Normal
        </Button>
        <Button
          variant={chartMode === 'running_average' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartMode('running_average')}
          className="h-8 px-3"
        >
          7-Day Average
        </Button>
      </div>
    </div>
  )
}

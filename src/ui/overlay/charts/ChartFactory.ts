import type { DataPoint } from '../types'

declare global {
  interface Window {
    Chart?: new (ctx: CanvasRenderingContext2D, cfg: unknown) => ChartJsInstance
  }
}

type ChartJsDataset = {
  label: string
  data: number[]
  borderColor: string
  backgroundColor: string
  pointRadius: number
  borderWidth: number
  tension: number
  fill: boolean
}

type ChartJsInstance = {
  data: {
    labels: string[]
    datasets: ChartJsDataset[]
  }
  update: () => void
  destroy: () => void
}

export type RollingSeries = {
  label: string
  color: string
  points: DataPoint[]
}

export type LineChartOptions = {
  title?: string
  stacked?: boolean
  yMin?: number
  yMax?: number
}

export type ChartLike = {
  backend: 'chartjs' | 'mini'
  canvas: HTMLCanvasElement
  options: LineChartOptions
  chartJs?: ChartJsInstance
  mini?: MiniLineChart
}

let chartScriptPromise: Promise<boolean> | null = null

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function withAlpha(hexOrRgb: string, alpha: number): string {
  const a = clamp(alpha, 0, 1)
  if (hexOrRgb.startsWith('#') && (hexOrRgb.length === 7 || hexOrRgb.length === 4)) {
    let r = 255
    let g = 255
    let b = 255

    if (hexOrRgb.length === 7) {
      r = Number.parseInt(hexOrRgb.slice(1, 3), 16)
      g = Number.parseInt(hexOrRgb.slice(3, 5), 16)
      b = Number.parseInt(hexOrRgb.slice(5, 7), 16)
    } else {
      r = Number.parseInt(hexOrRgb.slice(1, 2).repeat(2), 16)
      g = Number.parseInt(hexOrRgb.slice(2, 3).repeat(2), 16)
      b = Number.parseInt(hexOrRgb.slice(3, 4).repeat(2), 16)
    }

    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
  }

  return hexOrRgb
}

class MiniLineChart {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: LineChartOptions,
  ) {}

  destroy(): void {
    const ctx = this.canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  update(series: RollingSeries[], maxPoints: number): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const bounds = this.canvas.getBoundingClientRect()
    const width = Math.max(1, Math.floor(bounds.width * dpr))
    const height = Math.max(1, Math.floor(bounds.height * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
    ctx.fillRect(0, 0, width, height)

    const safeSeries = series.filter((s) => s.points.length > 0)
    if (safeSeries.length === 0) {
      this.drawFrame(ctx, width, height)
      return
    }

    const left = 40 * dpr
    const right = width - 12 * dpr
    const top = 12 * dpr
    const bottom = height - 24 * dpr
    const plotW = Math.max(1, right - left)
    const plotH = Math.max(1, bottom - top)

    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (let s = 0; s < safeSeries.length; s++) {
      const points = safeSeries[s]?.points.slice(-maxPoints) ?? []
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        if (point.value < minY) minY = point.value
        if (point.value > maxY) maxY = point.value
      }
    }

    if (typeof this.options.yMin === 'number') {
      minY = this.options.yMin
    }
    if (typeof this.options.yMax === 'number') {
      maxY = this.options.yMax
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
      minY = 0
      maxY = 1
    }

    this.drawFrame(ctx, width, height)

    for (let s = 0; s < safeSeries.length; s++) {
      const item = safeSeries[s]
      if (!item) continue
      const points = item.points.slice(-maxPoints)
      if (points.length < 2) {
        continue
      }

      ctx.strokeStyle = item.color
      ctx.lineWidth = 2 * dpr
      ctx.beginPath()

      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        if (!point) continue
        const x = left + (i / Math.max(1, points.length - 1)) * plotW
        const yNorm = (point.value - minY) / Math.max(1e-6, maxY - minY)
        const y = bottom - clamp(yNorm, 0, 1) * plotH
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(220, 232, 255, 0.75)'
    ctx.font = `${11 * dpr}px ui-monospace`
    ctx.fillText(maxY.toFixed(1), 4 * dpr, top + 8 * dpr)
    ctx.fillText(minY.toFixed(1), 4 * dpr, bottom)
  }

  private drawFrame(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1
    const left = 40 * dpr
    const right = width - 12 * dpr
    const top = 12 * dpr
    const bottom = height - 24 * dpr

    ctx.strokeStyle = 'rgba(190, 209, 255, 0.24)'
    ctx.lineWidth = 1 * dpr
    ctx.beginPath()
    ctx.moveTo(left, top)
    ctx.lineTo(left, bottom)
    ctx.lineTo(right, bottom)
    ctx.stroke()
  }
}

export async function ensureChartJsLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false
  }

  if (window.Chart) {
    return true
  }

  if (chartScriptPromise) {
    return chartScriptPromise
  }

  chartScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-biotica-chartjs]')
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Chart)), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
    script.async = true
    script.dataset.bioticaChartjs = '1'
    script.onload = () => resolve(Boolean(window.Chart))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })

  return chartScriptPromise
}

export function createLineChart(
  canvasEl: HTMLCanvasElement,
  options: LineChartOptions = {},
): ChartLike {
  const ctx = canvasEl.getContext('2d')
  if (ctx && window.Chart) {
    const chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [],
      },
      options: {
        animation: false,
        parsing: false,
        normalized: true,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#c9d9ff',
              boxWidth: 10,
              boxHeight: 10,
              font: {
                family: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                size: 11,
              },
            },
          },
          title: {
            display: Boolean(options.title),
            text: options.title,
            color: '#e7f0ff',
            font: {
              family: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              size: 12,
              weight: '600',
            },
          },
        },
        scales: {
          x: {
            ticks: {
              display: false,
            },
            grid: {
              color: 'rgba(180, 200, 255, 0.08)',
            },
          },
          y: {
            beginAtZero: true,
            stacked: Boolean(options.stacked),
            min: options.yMin,
            max: options.yMax,
            ticks: {
              color: '#bcd0f6',
              font: {
                family: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                size: 10,
              },
            },
            grid: {
              color: 'rgba(180, 200, 255, 0.08)',
            },
          },
        },
      },
    })

    return {
      backend: 'chartjs',
      canvas: canvasEl,
      options,
      chartJs: chart,
    }
  }

  return {
    backend: 'mini',
    canvas: canvasEl,
    options,
    mini: new MiniLineChart(canvasEl, options),
  }
}

export function updateRollingDataset(
  chart: ChartLike,
  series: RollingSeries[],
  maxPoints = 300,
): void {
  const safeMax = Math.max(2, maxPoints | 0)

  if (chart.backend === 'mini') {
    chart.mini?.update(series, safeMax)
    return
  }

  const chartJs = chart.chartJs
  if (!chartJs) {
    return
  }

  const first = series[0]
  const labels = (first?.points ?? []).slice(-safeMax).map((point) => String(point.tick))

  const datasets: ChartJsDataset[] = []
  for (let i = 0; i < series.length; i++) {
    const item = series[i]
    if (!item) continue
    const points = item.points.slice(-safeMax)
    datasets.push({
      label: item.label,
      data: points.map((point) => point.value),
      borderColor: item.color,
      backgroundColor: withAlpha(item.color, chart.options.stacked ? 0.24 : 0.12),
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.25,
      fill: Boolean(chart.options.stacked),
    })
  }

  chartJs.data.labels = labels
  chartJs.data.datasets = datasets
  chartJs.update()
}

export function destroyChart(chart: ChartLike | null): void {
  if (!chart) {
    return
  }

  if (chart.backend === 'chartjs') {
    chart.chartJs?.destroy()
    return
  }

  chart.mini?.destroy()
}

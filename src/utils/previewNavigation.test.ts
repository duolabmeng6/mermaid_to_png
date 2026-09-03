import { describe, expect, it } from 'vitest'
import {
  MAX_PREVIEW_ZOOM,
  MIN_PREVIEW_ZOOM,
  getNextPreviewZoom,
  getScrollAdjustment,
  getZoomAnchor,
} from './previewNavigation'

describe('previewNavigation', () => {
  it('按滚轮方向连续缩放并限制在 10%-400%', () => {
    expect(getNextPreviewZoom(1, -20, 0, 800)).toBeGreaterThan(1)
    expect(getNextPreviewZoom(1, 20, 0, 800)).toBeLessThan(1)
    expect(getNextPreviewZoom(4, -1_000, 0, 800)).toBe(MAX_PREVIEW_ZOOM)
    expect(getNextPreviewZoom(0.1, 1_000, 0, 800)).toBe(MIN_PREVIEW_ZOOM)
  })

  it('保留细粒度触控板事件的缩放增量', () => {
    let zoom = 1
    for (let index = 0; index < 10; index += 1) {
      zoom = getNextPreviewZoom(zoom, 0.5, 0, 800)
    }

    expect(zoom).toBeLessThan(1)
    expect(zoom).toBeCloseTo(Math.exp(-0.01), 8)
  })

  it('把触点转换为图表内相对锚点并限制在边界内', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 }

    expect(getZoomAnchor(rect, 150, 125)).toEqual({ x: 0.25, y: 0.75 })
    expect(getZoomAnchor(rect, 20, 300)).toEqual({ x: 0, y: 1 })
  })

  it('计算缩放后保持锚点位于触点所需的滚动增量', () => {
    const adjustment = getScrollAdjustment(
      { left: 80, top: 30, width: 400, height: 200 },
      { x: 0.25, y: 0.75 },
      150,
      125,
    )

    expect(adjustment).toEqual({ left: 30, top: 55 })
  })
})

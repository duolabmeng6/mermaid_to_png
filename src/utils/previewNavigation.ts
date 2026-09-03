export const MIN_PREVIEW_ZOOM = 0.1
export const MAX_PREVIEW_ZOOM = 4

export interface ZoomAnchor {
  x: number
  y: number
}

interface RectBounds {
  left: number
  top: number
  width: number
  height: number
}

export function getNextPreviewZoom(
  currentZoom: number,
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  const pixelDelta =
    deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * viewportHeight : deltaY
  const zoom = currentZoom * Math.exp(-pixelDelta * 0.002)
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, zoom))
}

export function getZoomAnchor(
  rect: RectBounds,
  clientX: number,
  clientY: number,
): ZoomAnchor {
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height))),
  }
}

export function getScrollAdjustment(
  rect: RectBounds,
  anchor: ZoomAnchor,
  clientX: number,
  clientY: number,
): { left: number; top: number } {
  return {
    left: rect.left + rect.width * anchor.x - clientX,
    top: rect.top + rect.height * anchor.y - clientY,
  }
}

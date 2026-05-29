import type { Segment } from '@streetmix/types'

/**
 * Deterministic SVG renderer that converts a street cross-section
 * into a stylised perspective "street-view" image. Used in the
 * offline mode of the AI render dialog — fast, reactive to design
 * changes, no API costs. The dialog can swap this out for a real
 * image-model response by populating its srcDataUrl prop.
 */

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'rain'
export type CameraAngle = 'pedestrian' | 'cyclist' | 'driver' | 'aerial'

interface RenderInput {
  segments: Segment[]
  time: TimeOfDay
  camera: CameraAngle
  width?: number
  height?: number
}

const SKY: Record<TimeOfDay, [string, string]> = {
  day: ['#9cd6f5', '#e6f3fb'],
  sunset: ['#f5a565', '#ffd9a8'],
  night: ['#1e2a48', '#3a4a6c'],
  rain: ['#7a8896', '#aeb8c2'],
}

const ROAD: Record<TimeOfDay, string> = {
  day: '#3a3f45',
  sunset: '#5a3f35',
  night: '#1a1f25',
  rain: '#3a3f45',
}

const ROAD_LINE: Record<TimeOfDay, string> = {
  day: '#ffd400',
  sunset: '#ffe480',
  night: '#cfae3a',
  rain: '#ffd400',
}

const SEGMENT_COLOR: Record<string, string> = {
  sidewalk: '#cfc9bb',
  'sidewalk-tree': '#c2caac',
  'sidewalk-bench': '#cfc9bb',
  'sidewalk-bike-rack': '#cfc9bb',
  'sidewalk-lamp': '#cfc9bb',
  'sidewalk-wayfinding': '#cfc9bb',
  'outdoor-dining': '#d0b483',
  parklet: '#7fa86b',
  crosswalk: '#e8dfc4',
  'bike-lane': '#a83a28',
  bikeshare: '#a83a28',
  scooter: '#a83a28',
  'parking-lane': '#9c9888',
  'flex-zone': '#8c8878',
  'flex-zone-curb': '#8c8878',
  'bus-lane': '#a83a28',
  'brt-lane': '#a83a28',
  divider: '#6d8a40',
  bioswale: '#3a8a4a',
  'drainage-channel': '#5a7c9a',
}

/**
 * Returns an SVG string showing the cross-section as a perspective
 * street-view. The viewer stands on a sidewalk on the left side and
 * looks down the length of the street toward a vanishing point on
 * the horizon.
 */
export function renderPerspectiveSVG(input: RenderInput): string {
  const W = input.width ?? 640
  const H = input.height ?? 400
  const horizonY = H * 0.4
  const totalWidth =
    input.segments.reduce((sum, s) => sum + (s.width ?? 0), 0) || 1

  // Cumulative x-offset of each segment (in meters), normalised.
  const positions: Array<{ seg: Segment; x0: number; x1: number }> = []
  let cursor = 0
  for (const seg of input.segments) {
    const x0 = cursor / totalWidth
    cursor += seg.width ?? 0
    const x1 = cursor / totalWidth
    positions.push({ seg, x0, x1 })
  }

  const [skyA, skyB] = SKY[input.time]

  // Camera shifts the vanishing point.
  const vanishY = horizonY
  const vanishX = input.camera === 'aerial' ? W * 0.5 : W * 0.5
  const camYOffset =
    input.camera === 'aerial' ? -H * 0.25 : input.camera === 'driver' ? 30 : 0

  // Project a normalised cross-section x [0..1] to two screen-space
  // points: the near edge (full screen width) and the vanishing
  // point. Returns a trapezoid path.
  function trapezoid(x0: number, x1: number, color: string): string {
    const nx0 = x0 * W
    const nx1 = x1 * W
    const fx0 = vanishX + (x0 - 0.5) * 30
    const fx1 = vanishX + (x1 - 0.5) * 30
    const ny = H + camYOffset
    const fy = vanishY + camYOffset
    return `<path d="M ${nx0} ${ny} L ${nx1} ${ny} L ${fx1} ${fy} L ${fx0} ${fy} Z" fill="${color}" />`
  }

  let layers = ''

  // Sky gradient
  layers += `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${skyA}" />
        <stop offset="100%" stop-color="${skyB}" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${horizonY + camYOffset}" fill="url(#sky)" />
  `

  // Sun / moon
  if (input.time === 'day') {
    layers += `<circle cx="${W * 0.78}" cy="${horizonY * 0.4 + camYOffset}" r="22" fill="#fff8cf" />`
  } else if (input.time === 'sunset') {
    layers += `<circle cx="${W * 0.5}" cy="${horizonY + camYOffset - 5}" r="32" fill="#ffb060" opacity="0.9" />`
  } else if (input.time === 'night') {
    layers += `<circle cx="${W * 0.72}" cy="${horizonY * 0.3 + camYOffset}" r="16" fill="#f0e6c0" />`
    // Stars
    const stars = [0.12, 0.22, 0.34, 0.55, 0.65, 0.82, 0.92]
    for (const x of stars) {
      const y = horizonY * (0.1 + ((x * 7) % 0.3)) + camYOffset
      layers += `<circle cx="${x * W}" cy="${y}" r="1.2" fill="white" opacity="0.8" />`
    }
  }

  // Ground past the horizon (green field) for aerial-only feel
  layers += `<rect x="0" y="${horizonY + camYOffset}" width="${W}" height="${H - horizonY - camYOffset}" fill="#a6b89a" />`

  // Render each segment as a perspective stripe.
  // Sort so the road core is drawn last for proper depth feel.
  for (const { seg, x0, x1 } of positions) {
    const isRoad =
      seg.type === 'drive-lane' ||
      seg.type === 'turn-lane' ||
      seg.type === 'bus-lane' ||
      seg.type === 'brt-lane'
    const color = isRoad
      ? ROAD[input.time]
      : (SEGMENT_COLOR[seg.type] ?? '#888')
    layers += trapezoid(x0, x1, color)
  }

  // Yellow centre line if there's a drive lane meeting another drive lane
  const driveBoundaries: number[] = []
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i].seg.type
    const b = positions[i + 1].seg.type
    const isCar = (t: string) =>
      t === 'drive-lane' || t === 'turn-lane' || t === 'bus-lane'
    if (isCar(a) && isCar(b)) driveBoundaries.push(positions[i].x1)
  }
  for (const x of driveBoundaries) {
    const nx = x * W
    const fx = vanishX + (x - 0.5) * 30
    const fy = vanishY + camYOffset
    const ny = H + camYOffset
    layers += `<line x1="${nx}" y1="${ny}" x2="${fx}" y2="${fy}"
      stroke="${ROAD_LINE[input.time]}" stroke-width="3"
      stroke-dasharray="14 12" />`
  }

  // Decorate segments with trees, lampposts, people, etc.
  const decorations: string[] = []
  let segIndex = 0
  for (const { seg, x0, x1 } of positions) {
    const xMid = (x0 + x1) / 2
    const segWidth = x1 - x0
    if (
      seg.type === 'sidewalk-tree' ||
      (seg.type === 'divider' &&
        ['big-tree', 'small-tree', 'palm-tree'].includes(
          seg.variant?.['divider-type'] ?? ''
        ))
    ) {
      // Two trees, one near and one mid-distance
      for (let k = 0; k < 2; k++) {
        const t = k === 0 ? 0.05 : 0.45
        const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, t)
        const cy = lerp(H + camYOffset, vanishY + camYOffset, t)
        const scale = 1 - t * 0.7
        decorations.push(treeSVG(cx, cy, scale))
      }
    }
    if (
      seg.type === 'sidewalk-lamp' ||
      (seg.type === 'sidewalk' && segIndex === 0)
    ) {
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.25)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.25)
      decorations.push(lampSVG(cx, cy, 0.75, input.time))
    }
    if (
      seg.type === 'sidewalk' &&
      segWidth > 0.08 &&
      input.camera !== 'aerial'
    ) {
      // A person walking on the sidewalk
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.12)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.12)
      decorations.push(personSVG(cx, cy, 0.9))
    }
    if (seg.type === 'bike-lane' && segWidth > 0.04) {
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.2)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.2)
      decorations.push(cyclistSVG(cx, cy, 0.8))
    }
    if (seg.type === 'drive-lane' && segWidth > 0.07) {
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.3)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.3)
      decorations.push(carSVG(cx, cy, 0.7, input.time))
    }
    if (seg.type === 'bus-lane' || seg.type === 'brt-lane') {
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.32)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.32)
      decorations.push(busSVG(cx, cy, 0.75))
    }
    if (seg.type === 'parklet' || seg.type === 'outdoor-dining') {
      const cx = lerp(xMid * W, vanishX + (xMid - 0.5) * 30, 0.15)
      const cy = lerp(H + camYOffset, vanishY + camYOffset, 0.15)
      decorations.push(parkletSVG(cx, cy, 0.85))
    }
    segIndex++
  }

  // Rain overlay
  if (input.time === 'rain') {
    for (let i = 0; i < 60; i++) {
      const x = (i * 37) % W
      const y = (i * 53) % H
      decorations.push(
        `<line x1="${x}" y1="${y}" x2="${x + 6}" y2="${y + 20}" stroke="white" stroke-width="0.6" opacity="0.5" />`
      )
    }
  }

  layers += decorations.join('')

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${layers}</svg>`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function treeSVG(cx: number, cy: number, s: number): string {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <rect x="-2" y="-4" width="4" height="18" fill="#5a3f28" />
      <circle cx="0" cy="-12" r="14" fill="#4f7a44" />
      <circle cx="-6" cy="-8" r="10" fill="#6a9258" />
      <circle cx="6" cy="-10" r="10" fill="#5d8848" />
    </g>
  `
}

function lampSVG(cx: number, cy: number, s: number, time: TimeOfDay): string {
  const glow = time === 'night' || time === 'sunset' || time === 'rain'
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <rect x="-1" y="-30" width="2" height="30" fill="#444" />
      <circle cx="0" cy="-32" r="3" fill="${glow ? '#ffe097' : '#888'}" />
      ${glow ? `<circle cx="0" cy="-32" r="8" fill="#ffe097" opacity="0.3" />` : ''}
    </g>
  `
}

function personSVG(cx: number, cy: number, s: number): string {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <circle cx="0" cy="-22" r="4" fill="#d4a37a" />
      <rect x="-3" y="-18" width="6" height="12" fill="#3a5d8c" />
      <rect x="-2" y="-6" width="2" height="8" fill="#222" />
      <rect x="0" y="-6" width="2" height="8" fill="#222" />
    </g>
  `
}

function cyclistSVG(cx: number, cy: number, s: number): string {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <circle cx="-6" cy="0" r="5" fill="none" stroke="#222" stroke-width="1.5" />
      <circle cx="6" cy="0" r="5" fill="none" stroke="#222" stroke-width="1.5" />
      <line x1="-6" y1="0" x2="0" y2="-8" stroke="#222" stroke-width="1.5" />
      <line x1="6" y1="0" x2="0" y2="-8" stroke="#222" stroke-width="1.5" />
      <circle cx="0" cy="-14" r="4" fill="#d4a37a" />
      <rect x="-3" y="-10" width="6" height="6" fill="#c33" />
    </g>
  `
}

function carSVG(cx: number, cy: number, s: number, time: TimeOfDay): string {
  const headlight = time === 'night' || time === 'sunset' || time === 'rain'
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <rect x="-22" y="-8" width="44" height="14" rx="4" fill="#446" />
      <rect x="-18" y="-16" width="36" height="10" rx="4" fill="#557" />
      <circle cx="-14" cy="8" r="4" fill="#222" />
      <circle cx="14" cy="8" r="4" fill="#222" />
      ${
        headlight
          ? `<circle cx="-18" cy="-2" r="3" fill="#fff8cf" />
                     <circle cx="18" cy="-2" r="3" fill="#fff8cf" />`
          : ''
      }
    </g>
  `
}

function busSVG(cx: number, cy: number, s: number): string {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <rect x="-32" y="-22" width="64" height="26" rx="3" fill="#d65" />
      <rect x="-28" y="-19" width="14" height="9" fill="#bce" />
      <rect x="-10" y="-19" width="14" height="9" fill="#bce" />
      <rect x="8" y="-19" width="14" height="9" fill="#bce" />
      <circle cx="-20" cy="6" r="5" fill="#222" />
      <circle cx="20" cy="6" r="5" fill="#222" />
    </g>
  `
}

function parkletSVG(cx: number, cy: number, s: number): string {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <rect x="-18" y="-8" width="36" height="12" rx="2" fill="#7fa86b" />
      <circle cx="-12" cy="-4" r="3" fill="#e0c084" />
      <circle cx="0" cy="-4" r="3" fill="#e0c084" />
      <circle cx="12" cy="-4" r="3" fill="#e0c084" />
    </g>
  `
}

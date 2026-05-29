import type { Segment, StreetState } from '@streetmix/types'

/**
 * Street Quality Score
 *
 * Heuristic scoring on top of a street design. Computes subscores for
 * walkability, bike safety, tree canopy, accessibility, and Vision Zero
 * (collision risk), plus rough cost and embodied carbon estimates.
 *
 * Inputs are taken straight from the StreetState; outputs are pure data
 * structures so the UI layer can render them however it wants.
 *
 * Calibration: scores are normalised to 0–100. They are intentionally
 * generous toward designs that follow common Complete Streets / NACTO
 * guidance and harsh on car-dominated cross-sections.
 */

export type ScoreCategory =
  | 'walkability'
  | 'bikeSafety'
  | 'greenCover'
  | 'accessibility'
  | 'visionZero'

export interface Subscore {
  category: ScoreCategory
  value: number // 0–100
  rating: 'good' | 'warn' | 'bad'
  hint: string
}

export interface QualityScoreData {
  overall: number // 0–100
  grade: string // A+ … D
  subscores: Subscore[]
  cost: {
    perMeterTWD: number
    per100mTWD: number
  }
  carbon: {
    constructionKgCO2e: number
    constructionTonsPer100m: number
  }
  suggestions: string[]
}

const CLAMP = (n: number) => Math.max(0, Math.min(100, n))
const ROUND = (n: number) => Math.round(n)

const SIDEWALK_TYPES = new Set([
  'sidewalk',
  'sidewalk-tree',
  'sidewalk-bench',
  'sidewalk-bike-rack',
  'sidewalk-lamp',
  'sidewalk-wayfinding',
])

const BIKE_TYPES = new Set(['bike-lane', 'bikeshare', 'scooter'])

const GREEN_TYPES = new Set([
  'sidewalk-tree',
  'divider',
  'parklet',
  'bioswale',
  'drainage-channel',
])

const BUFFER_TYPES = new Set([
  'divider',
  'parklet',
  'parking-lane',
  'bioswale',
  'drainage-channel',
  'guardrail',
])

interface Indexed extends Segment {
  index: number
}

function totalWidth(segs: Segment[]): number {
  return segs.reduce((sum, s) => sum + (s.width ?? 0), 0)
}

function widthOf(segs: Segment[], pred: (s: Segment) => boolean): number {
  return segs.filter(pred).reduce((sum, s) => sum + (s.width ?? 0), 0)
}

function countOf(segs: Segment[], pred: (s: Segment) => boolean): number {
  return segs.filter(pred).length
}

/**
 * Score walkability based on combined sidewalk width and presence of
 * pedestrian amenities (trees, benches, lamps, parklets, outdoor dining).
 */
function scoreWalkability(segs: Segment[]): Subscore {
  const sidewalkWidth = widthOf(segs, (s) => SIDEWALK_TYPES.has(s.type))
  const widestSidewalk = Math.max(
    0,
    ...segs.filter((s) => SIDEWALK_TYPES.has(s.type)).map((s) => s.width ?? 0)
  )
  const amenities = countOf(
    segs,
    (s) =>
      s.type === 'sidewalk-bench' ||
      s.type === 'sidewalk-lamp' ||
      s.type === 'sidewalk-wayfinding' ||
      s.type === 'outdoor-dining' ||
      s.type === 'parklet'
  )
  const hasCrosswalk = segs.some((s) => s.type === 'crosswalk')
  const hasTwoSidewalks = countOf(segs, (s) => SIDEWALK_TYPES.has(s.type)) >= 2

  // Each metre of sidewalk worth ~10 points, capped at 50
  const widthScore = Math.min(50, sidewalkWidth * 8)
  // Bonus for wide sidewalk (>= 3 m)
  const wideBonus = widestSidewalk >= 3 ? 15 : widestSidewalk >= 2 ? 8 : 0
  const amenityBonus = Math.min(15, amenities * 4)
  const crosswalkBonus = hasCrosswalk ? 10 : 0
  const symmetryBonus = hasTwoSidewalks ? 10 : 0

  const value = CLAMP(
    widthScore + wideBonus + amenityBonus + crosswalkBonus + symmetryBonus
  )

  let hint: string
  if (!hasTwoSidewalks) hint = '⚠ 街道未配置雙側人行道'
  else if (widestSidewalk < 1.5) hint = '⚠ 人行道寬度低於 1.5m'
  else if (widestSidewalk < 3)
    hint = `人行道 ${widestSidewalk.toFixed(1)}m，可加寬至 3m`
  else hint = `人行道 ${widestSidewalk.toFixed(1)}m 達 NACTO 建議`

  return {
    category: 'walkability',
    value: ROUND(value),
    rating: rate(value),
    hint,
  }
}

/**
 * Score bike safety based on presence and width of bike lanes, plus
 * physical buffering against motor traffic.
 */
function scoreBikeSafety(segs: Segment[]): Subscore {
  const bikeSegs = segs.filter((s) => BIKE_TYPES.has(s.type))
  const bikeWidth = totalWidth(bikeSegs)

  if (bikeSegs.length === 0) {
    return {
      category: 'bikeSafety',
      value: 25,
      rating: 'bad',
      hint: '⚠ 無自行車道',
    }
  }

  // Width score: 2 m bike lane = 35 points, scaled
  const widthScore = Math.min(40, (bikeWidth / 2) * 35)

  // Buffer score: is each bike segment adjacent to a buffer (divider,
  // parking, bioswale, etc.) rather than directly next to a drive lane?
  const indexed: Indexed[] = segs.map((s, i) => ({ ...s, index: i }))
  let bufferedCount = 0
  for (const b of indexed.filter((s) => BIKE_TYPES.has(s.type))) {
    const left = indexed[b.index - 1]
    const right = indexed[b.index + 1]
    const leftBuffer =
      left && (BUFFER_TYPES.has(left.type) || SIDEWALK_TYPES.has(left.type))
    const rightBuffer =
      right && (BUFFER_TYPES.has(right.type) || SIDEWALK_TYPES.has(right.type))
    if (leftBuffer || rightBuffer) bufferedCount++
  }
  const bufferScore =
    bikeSegs.length > 0 ? (bufferedCount / bikeSegs.length) * 35 : 0

  // Bidirectional bonus
  const hasTwoWay = bikeSegs.some(
    (s) => s.variant?.['bike-direction']?.startsWith('twoway') === true
  )
  const twoWayBonus = hasTwoWay ? 15 : 0

  // Symmetry: bike lane on both sides
  const symmetryBonus = bikeSegs.length >= 2 ? 10 : 0

  const value = CLAMP(widthScore + bufferScore + twoWayBonus + symmetryBonus)

  let hint: string
  if (bufferedCount < bikeSegs.length) hint = '⚠ 自行車道與車道相鄰、缺少緩衝'
  else if (bikeWidth < 2)
    hint = `自行車道 ${bikeWidth.toFixed(1)}m，建議至少 2m`
  else hint = `自行車道 ${bikeWidth.toFixed(1)}m，已設緩衝`

  return {
    category: 'bikeSafety',
    value: ROUND(value),
    rating: rate(value),
    hint,
  }
}

/**
 * Score tree canopy / green cover by counting green segments and
 * estimating shading ratio relative to street width.
 */
function scoreGreenCover(segs: Segment[]): Subscore {
  const greenWidth = widthOf(segs, (s) => GREEN_TYPES.has(s.type))
  const treeCount = countOf(
    segs,
    (s) =>
      s.type === 'sidewalk-tree' ||
      (s.type === 'divider' &&
        (s.variant?.['divider-type'] === 'big-tree' ||
          s.variant?.['divider-type'] === 'small-tree' ||
          s.variant?.['divider-type'] === 'palm-tree'))
  )
  const total = Math.max(totalWidth(segs), 1)
  const greenRatio = greenWidth / total

  // Approximate canopy ratio: trees give ~2 m radius each
  const canopyMeters = treeCount * 4
  const canopyRatio = canopyMeters / Math.max(total, 1)

  const greenScore = Math.min(50, greenRatio * 200)
  const canopyScore = Math.min(50, canopyRatio * 130)
  const value = CLAMP(greenScore + canopyScore)

  const hint = `${treeCount} 棵樹 · 遮蔭率約 ${Math.round(canopyRatio * 100)}%`
  return {
    category: 'greenCover',
    value: ROUND(value),
    rating: rate(value),
    hint,
  }
}

/**
 * Score accessibility: minimum sidewalk widths, crosswalk presence,
 * continuity.
 */
function scoreAccessibility(segs: Segment[]): Subscore {
  const sidewalks = segs.filter((s) => SIDEWALK_TYPES.has(s.type))
  if (sidewalks.length === 0) {
    return {
      category: 'accessibility',
      value: 20,
      rating: 'bad',
      hint: '⚠ 無人行道',
    }
  }

  const minWidth = Math.min(...sidewalks.map((s) => s.width ?? 0))
  const hasCrosswalk = segs.some((s) => s.type === 'crosswalk')

  // Width compliance — 1.5 m clear width is the common minimum for wheelchair
  // passing under most accessibility standards.
  const widthScore =
    minWidth >= 1.8 ? 60 : minWidth >= 1.5 ? 45 : minWidth >= 1.2 ? 25 : 10
  const symmetryScore = sidewalks.length >= 2 ? 20 : 0
  const crosswalkScore = hasCrosswalk ? 20 : 0

  const value = CLAMP(widthScore + symmetryScore + crosswalkScore)
  const hint =
    minWidth >= 1.5
      ? `最窄通行 ${minWidth.toFixed(1)}m ≥ 1.5m`
      : `⚠ 最窄通行寬 ${minWidth.toFixed(1)}m 低於建議`

  return {
    category: 'accessibility',
    value: ROUND(value),
    rating: rate(value),
    hint,
  }
}

/**
 * Score Vision Zero (collision risk reduction). Penalises wide fast lanes
 * and rewards traffic calming features like buffers between cars and
 * vulnerable users.
 */
function scoreVisionZero(segs: Segment[]): Subscore {
  const driveLanes = segs.filter(
    (s) => s.type === 'drive-lane' || s.type === 'turn-lane'
  )
  const wideLanes = driveLanes.filter((s) => (s.width ?? 0) > 3.3).length

  // Base: fewer through-lanes is safer
  let value = 70
  value -= wideLanes * 10 // Wide lanes encourage speeding
  value -= Math.max(0, driveLanes.length - 2) * 8 // Multi-lane bias

  // Buffers between bike/sidewalk and drive lanes
  const indexed: Indexed[] = segs.map((s, i) => ({ ...s, index: i }))
  const hasParkingBuffer = indexed.some((s, i) => {
    if (s.type !== 'parking-lane') return false
    const left = indexed[i - 1]
    const right = indexed[i + 1]
    return (
      (left && (SIDEWALK_TYPES.has(left.type) || BIKE_TYPES.has(left.type))) ||
      (right && (SIDEWALK_TYPES.has(right.type) || BIKE_TYPES.has(right.type)))
    )
  })
  if (hasParkingBuffer) value += 12

  const hasPhysicalDivider = segs.some(
    (s) => s.type === 'divider' || s.type === 'guardrail'
  )
  if (hasPhysicalDivider) value += 10

  const hasCrosswalk = segs.some((s) => s.type === 'crosswalk')
  if (hasCrosswalk) value += 5
  else value -= 8

  value = CLAMP(value)

  let hint: string
  if (wideLanes > 1) hint = `⚠ ${wideLanes} 條車道寬度 > 3.3m，易誘發超速`
  else if (!hasPhysicalDivider) hint = '⚠ 無實體分隔，與車道高速相鄰'
  else hint = `${driveLanes.length} 條車道，有分隔緩衝`

  return {
    category: 'visionZero',
    value: ROUND(value),
    rating: rate(value),
    hint,
  }
}

/**
 * Estimate construction cost (NTD) per metre of street length.
 * Numbers are rough order-of-magnitude figures for Taiwan, 2025.
 */
function estimateCost(segs: Segment[]): {
  perMeterTWD: number
  per100mTWD: number
} {
  // Cost per m² of cross-section
  const COST_PER_M2: Record<string, number> = {
    sidewalk: 4000,
    'sidewalk-tree': 4000,
    'sidewalk-bench': 4000,
    'sidewalk-bike-rack': 4000,
    'sidewalk-lamp': 4000,
    'sidewalk-wayfinding': 4000,
    'outdoor-dining': 4500,
    parklet: 12000,
    crosswalk: 2500,
    'bike-lane': 5000,
    bikeshare: 5500,
    scooter: 5000,
    'drive-lane': 3500,
    'turn-lane': 3500,
    'parking-lane': 3500,
    'flex-zone': 3800,
    'flex-zone-curb': 3800,
    'bus-lane': 4500,
    'brt-lane': 5500,
    'brt-station': 8000,
    streetcar: 9000,
    'light-rail': 10000,
    'transit-shelter': 8000,
    divider: 2500,
    bioswale: 6500,
    'drainage-channel': 3500,
    guardrail: 1500,
    wall: 2000,
  }
  // One-off objects (per item along 100 m length)
  const ITEM_COST: Record<string, number> = {
    'sidewalk-tree': 30000,
    'sidewalk-bench': 8000,
    'sidewalk-lamp': 20000,
    'sidewalk-wayfinding': 12000,
    'sidewalk-bike-rack': 5000,
    parklet: 50000,
    'transit-shelter': 200000,
    'brt-station': 350000,
    bikeshare: 80000,
  }

  let perMeter = 0
  let perItemPer100m = 0
  for (const s of segs) {
    const m2 = COST_PER_M2[s.type] ?? 0
    perMeter += m2 * (s.width ?? 0)
    if (ITEM_COST[s.type]) {
      // assume one item every 8 m of street length
      perItemPer100m += ITEM_COST[s.type] * (100 / 8)
    }
  }

  const per100m = perMeter * 100 + perItemPer100m
  return { perMeterTWD: Math.round(perMeter), per100mTWD: Math.round(per100m) }
}

/**
 * Estimate construction-phase embodied carbon. Rough numbers based on
 * common materials (asphalt, concrete) — meant for relative comparison,
 * not LCA accuracy.
 */
function estimateCarbon(segs: Segment[]): {
  constructionKgCO2e: number
  constructionTonsPer100m: number
} {
  // kg CO₂e per m² (cross-section, scaled to 100 m length below)
  const CARBON_PER_M2: Record<string, number> = {
    sidewalk: 120,
    'sidewalk-tree': 120,
    'sidewalk-bench': 120,
    'sidewalk-bike-rack': 120,
    'sidewalk-lamp': 120,
    'sidewalk-wayfinding': 120,
    'outdoor-dining': 130,
    parklet: 110,
    crosswalk: 90,
    'bike-lane': 90,
    'drive-lane': 95,
    'turn-lane': 95,
    'parking-lane': 95,
    'flex-zone': 95,
    'flex-zone-curb': 95,
    'bus-lane': 105,
    'brt-lane': 110,
    'brt-station': 180,
    streetcar: 220,
    'light-rail': 230,
    'transit-shelter': 180,
    divider: 60,
    bioswale: 40,
    'drainage-channel': 100,
    guardrail: 70,
    wall: 90,
  }
  // Trees sequester carbon; treat as negative
  const TREE_OFFSET_KG = -250 // per tree per 100 m of street, lifecycle

  let total = 0
  for (const s of segs) {
    const v = CARBON_PER_M2[s.type] ?? 80
    total += v * (s.width ?? 0) * 100 // 100 m length
  }
  const trees = countOf(
    segs,
    (s) => s.type === 'sidewalk-tree' || s.type === 'bioswale'
  )
  total += trees * TREE_OFFSET_KG * (100 / 8)

  return {
    constructionKgCO2e: Math.max(0, Math.round(total)),
    constructionTonsPer100m: Math.max(0, +(total / 1000).toFixed(1)),
  }
}

function rate(value: number): 'good' | 'warn' | 'bad' {
  if (value >= 70) return 'good'
  if (value >= 50) return 'warn'
  return 'bad'
}

function toGrade(overall: number): string {
  if (overall >= 90) return 'A+'
  if (overall >= 85) return 'A'
  if (overall >= 80) return 'A-'
  if (overall >= 75) return 'B+'
  if (overall >= 70) return 'B'
  if (overall >= 65) return 'B-'
  if (overall >= 60) return 'C+'
  if (overall >= 55) return 'C'
  if (overall >= 50) return 'C-'
  return 'D'
}

/**
 * Generate plain-language suggestions to nudge the design upward,
 * picked from the lowest-scoring subscores.
 */
function buildSuggestions(subscores: Subscore[], segs: Segment[]): string[] {
  const out: string[] = []
  const byVal = [...subscores].sort((a, b) => a.value - b.value)

  for (const s of byVal.slice(0, 3)) {
    if (s.value >= 75) continue
    switch (s.category) {
      case 'walkability':
        out.push('加寬人行道至 3m 或新增行道樹／長椅，步行分數可 +12')
        break
      case 'bikeSafety':
        if (!segs.some((x) => BIKE_TYPES.has(x.type))) {
          out.push('新增雙向自行車道，自行車安全 +35')
        } else {
          out.push('在自行車道旁加 0.5m 緩衝（停車格或分隔島），安全分數 +14')
        }
        break
      case 'greenCover':
        out.push('每 8m 一棵行道樹可降低夏季表面溫度 4–7°C，綠覆 +18')
        break
      case 'accessibility':
        out.push('確保兩側人行道淨寬 ≥ 1.5m，無障礙 +20')
        break
      case 'visionZero':
        out.push('將一條車道改為共享車道或縮窄至 3m，Vision Zero +22')
        break
    }
  }
  return out
}

/**
 * Top-level entry point. Combines all subscores into an overall
 * weighted Street Quality Score.
 */
export function getQualityScore(street: StreetState): QualityScoreData {
  const segs = street.segments ?? []
  const subscores: Subscore[] = [
    scoreWalkability(segs),
    scoreBikeSafety(segs),
    scoreGreenCover(segs),
    scoreAccessibility(segs),
    scoreVisionZero(segs),
  ]

  // Weighted average: walkability and safety carry the most weight
  const weights: Record<ScoreCategory, number> = {
    walkability: 0.25,
    bikeSafety: 0.2,
    greenCover: 0.15,
    accessibility: 0.2,
    visionZero: 0.2,
  }
  const overall = subscores.reduce(
    (sum, s) => sum + s.value * weights[s.category],
    0
  )
  const overallRounded = ROUND(overall)

  return {
    overall: overallRounded,
    grade: toGrade(overallRounded),
    subscores,
    cost: estimateCost(segs),
    carbon: estimateCarbon(segs),
    suggestions: buildSuggestions(subscores, segs),
  }
}

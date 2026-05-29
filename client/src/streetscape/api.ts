import { renderPerspectiveSVG } from './perspective_render.js'

import type { Segment } from '@streetmix/types'
import type { CameraAngle, TimeOfDay } from './perspective_render.js'

/**
 * AI Streetscape Render API surface.
 *
 * Today this returns a deterministic SVG perspective render derived
 * from the segments. The same function signature is meant to be a
 * drop-in for a real image-model call (e.g. Anthropic Claude with a
 * vision-capable upstream, an OpenAI / Stability / Replicate
 * endpoint). To wire one in:
 *
 *   1. Add the API key to the .env via REACT_APP_AI_RENDER_KEY or
 *      similar.
 *   2. Replace the body of `requestAIRender` with the fetch call,
 *      building the prompt from `buildPrompt(req)` below.
 *   3. The dialog already handles loading / error / image data URL,
 *      so no UI changes are required.
 */

export interface RenderRequest {
  segments: Segment[]
  time: TimeOfDay
  camera: CameraAngle
  streetName?: string
  notes?: string
}

export interface RenderResult {
  imageSrc: string // data URL or http URL
  provider: 'offline-svg' | 'anthropic' | 'stability' | 'openai' | 'mock'
  prompt: string
  latencyMs: number
}

/**
 * Build a natural-language prompt for an image model that
 * describes the cross-section in terms of widths, materials and
 * amenities. Used by both the offline path (for logging /
 * display) and the real-API path (as the prompt).
 */
export function buildPrompt(req: RenderRequest): string {
  const parts: string[] = []
  for (const seg of req.segments) {
    const width = seg.width?.toFixed(1) ?? '?'
    parts.push(`a ${width}m ${seg.type.replace(/-/g, ' ')}`)
  }
  const timeWord = {
    day: 'on a sunny day',
    sunset: 'at golden hour',
    night: 'at night with warm street lighting',
    rain: 'in light rain with reflections on wet pavement',
  }[req.time]
  const angleWord = {
    pedestrian: "from a pedestrian's eye level on the sidewalk",
    cyclist: "from a cyclist's perspective in the bike lane",
    driver: "from a driver's perspective in the inside lane",
    aerial: 'as a slightly elevated drone view',
  }[req.camera]
  const intro = req.streetName
    ? `A photorealistic street view of ${req.streetName} looking down the road, ${angleWord}, ${timeWord}.`
    : `A photorealistic urban street view looking down the road, ${angleWord}, ${timeWord}.`
  const cross = `From left to right the street cross-section is: ${parts.join(', ')}.`
  const style =
    'Cinematic lighting, hyperreal, soft depth-of-field, people and cars in motion. Avoid text and logos.'
  const extra = req.notes?.trim() ? ` ${req.notes.trim()}` : ''
  return `${intro} ${cross} ${style}${extra}`
}

/**
 * Today: render an SVG and return as a data URL. Tomorrow: swap
 * in a fetch to an image-generation API.
 */
export async function requestAIRender(
  req: RenderRequest
): Promise<RenderResult> {
  const start = performance.now()
  const prompt = buildPrompt(req)

  const svg = renderPerspectiveSVG({
    segments: req.segments,
    time: req.time,
    camera: req.camera,
    width: 800,
    height: 480,
  })

  // Small artificial delay so the UI's loading state can be seen
  // and so the experience matches the eventual real-API latency
  // ballpark (~1-3s for diffusion models).
  await new Promise((resolve) => setTimeout(resolve, 600))

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  return {
    imageSrc: dataUrl,
    provider: 'offline-svg',
    prompt,
    latencyMs: Math.round(performance.now() - start),
  }
}

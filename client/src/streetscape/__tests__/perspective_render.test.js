import { renderPerspectiveSVG } from '../perspective_render'
import { buildPrompt, requestAIRender } from '../api'

const seg = (type, width, variant = {}) => ({
  id: type,
  type,
  variantString: '',
  width,
  elevation: 0,
  slope: { on: false, values: [] },
  variant,
  warnings: [],
})

const sampleStreet = [
  seg('sidewalk', 3),
  seg('sidewalk-tree', 1),
  seg('bike-lane', 2),
  seg('drive-lane', 3),
  seg('drive-lane', 3),
  seg('sidewalk', 3),
]

describe('renderPerspectiveSVG', () => {
  it('produces an SVG string', () => {
    const out = renderPerspectiveSVG({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
    })
    expect(out.startsWith('<svg')).toBe(true)
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('respects width and height inputs', () => {
    const out = renderPerspectiveSVG({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
      width: 320,
      height: 180,
    })
    expect(out.includes('viewBox="0 0 320 180"')).toBe(true)
  })

  it('handles empty segments gracefully', () => {
    expect(() =>
      renderPerspectiveSVG({
        segments: [],
        time: 'day',
        camera: 'pedestrian',
      })
    ).not.toThrow()
  })

  it('changes output with time of day', () => {
    const day = renderPerspectiveSVG({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
    })
    const night = renderPerspectiveSVG({
      segments: sampleStreet,
      time: 'night',
      camera: 'pedestrian',
    })
    expect(day).not.toBe(night)
  })

  it('inserts road centre line when two car lanes meet', () => {
    const out = renderPerspectiveSVG({
      segments: [seg('drive-lane', 3), seg('drive-lane', 3)],
      time: 'day',
      camera: 'pedestrian',
    })
    expect(out).toContain('stroke-dasharray')
  })

  it('omits centre line when there are no adjacent car lanes', () => {
    const out = renderPerspectiveSVG({
      segments: [seg('sidewalk', 3), seg('bike-lane', 2)],
      time: 'day',
      camera: 'pedestrian',
    })
    expect(out).not.toContain('stroke-dasharray')
  })
})

describe('buildPrompt', () => {
  it('mentions each segment by type and width', () => {
    const prompt = buildPrompt({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
    })
    expect(prompt).toContain('3.0m sidewalk')
    expect(prompt).toContain('bike lane')
    expect(prompt).toContain('drive lane')
  })

  it('reflects time of day', () => {
    const day = buildPrompt({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
    })
    const rain = buildPrompt({
      segments: sampleStreet,
      time: 'rain',
      camera: 'pedestrian',
    })
    expect(day).not.toBe(rain)
    expect(rain).toContain('rain')
  })

  it('includes user notes when provided', () => {
    const prompt = buildPrompt({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
      notes: 'Taipei summer afternoon',
    })
    expect(prompt).toContain('Taipei summer afternoon')
  })

  it('mentions street name in the intro when present', () => {
    const prompt = buildPrompt({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
      streetName: '忠孝東路',
    })
    expect(prompt).toContain('忠孝東路')
  })
})

describe('requestAIRender', () => {
  it('returns a data URL and provider', async () => {
    const result = await requestAIRender({
      segments: sampleStreet,
      time: 'day',
      camera: 'pedestrian',
    })
    expect(result.imageSrc.startsWith('data:image/svg+xml')).toBe(true)
    expect(result.provider).toBe('offline-svg')
    expect(typeof result.prompt).toBe('string')
    expect(typeof result.latencyMs).toBe('number')
  })
})

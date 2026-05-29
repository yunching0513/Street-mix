import { getQualityScore } from '../quality_score'

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

const makeStreet = (segments) => ({ segments })

describe('quality_score', () => {
  it('returns a full QualityScoreData shape', () => {
    const street = makeStreet([
      seg('sidewalk', 3),
      seg('bike-lane', 2),
      seg('drive-lane', 3.5),
      seg('sidewalk', 3),
    ])

    const result = getQualityScore(street)

    expect(typeof result.overall).toBe('number')
    expect(result.overall).toBeGreaterThanOrEqual(0)
    expect(result.overall).toBeLessThanOrEqual(100)
    expect(typeof result.grade).toBe('string')
    expect(result.subscores).toHaveLength(5)
    expect(result.subscores.map((s) => s.category).sort()).toEqual([
      'accessibility',
      'bikeSafety',
      'greenCover',
      'visionZero',
      'walkability',
    ])
    expect(result.cost.per100mTWD).toBeGreaterThan(0)
    expect(result.carbon.constructionTonsPer100m).toBeGreaterThan(0)
  })

  it('scores a Complete-Streets-friendly cross-section above a car-dominated one', () => {
    const carDominated = makeStreet([
      seg('sidewalk', 1.2),
      seg('drive-lane', 4),
      seg('drive-lane', 4),
      seg('drive-lane', 4),
      seg('drive-lane', 4),
      seg('sidewalk', 1.2),
    ])

    const goodStreet = makeStreet([
      seg('sidewalk', 3),
      seg('sidewalk-tree', 1),
      seg('bike-lane', 2),
      seg('parking-lane', 2.5),
      seg('drive-lane', 3),
      seg('drive-lane', 3),
      seg('parking-lane', 2.5),
      seg('bike-lane', 2),
      seg('sidewalk-tree', 1),
      seg('sidewalk', 3),
    ])

    expect(getQualityScore(goodStreet).overall).toBeGreaterThan(
      getQualityScore(carDominated).overall
    )
  })

  it('penalises missing bike infrastructure', () => {
    const noBike = makeStreet([
      seg('sidewalk', 3),
      seg('drive-lane', 3),
      seg('drive-lane', 3),
      seg('sidewalk', 3),
    ])
    const withBike = makeStreet([
      seg('sidewalk', 3),
      seg('bike-lane', 2),
      seg('parking-lane', 2.5),
      seg('drive-lane', 3),
      seg('drive-lane', 3),
      seg('parking-lane', 2.5),
      seg('bike-lane', 2),
      seg('sidewalk', 3),
    ])

    const bikeScoreOff = getQualityScore(noBike).subscores.find(
      (s) => s.category === 'bikeSafety'
    ).value
    const bikeScoreOn = getQualityScore(withBike).subscores.find(
      (s) => s.category === 'bikeSafety'
    ).value

    expect(bikeScoreOn).toBeGreaterThan(bikeScoreOff)
  })

  it('rewards trees in green-cover scoring', () => {
    const noTrees = makeStreet([
      seg('sidewalk', 3),
      seg('drive-lane', 3),
      seg('sidewalk', 3),
    ])
    const withTrees = makeStreet([
      seg('sidewalk', 3),
      seg('sidewalk-tree', 1),
      seg('drive-lane', 3),
      seg('sidewalk-tree', 1),
      seg('sidewalk', 3),
    ])

    const greenOff = getQualityScore(noTrees).subscores.find(
      (s) => s.category === 'greenCover'
    ).value
    const greenOn = getQualityScore(withTrees).subscores.find(
      (s) => s.category === 'greenCover'
    ).value

    expect(greenOn).toBeGreaterThan(greenOff)
  })

  it('emits suggestions when subscores are below 75', () => {
    const minimalStreet = makeStreet([
      seg('drive-lane', 4),
      seg('drive-lane', 4),
    ])
    const result = getQualityScore(minimalStreet)
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('handles empty streets without crashing', () => {
    const result = getQualityScore(makeStreet([]))
    expect(typeof result.overall).toBe('number')
    expect(result.cost.per100mTWD).toBe(0)
  })

  it('assigns higher grade to higher overall score', () => {
    const lowStreet = makeStreet([seg('drive-lane', 5), seg('drive-lane', 5)])
    const highStreet = makeStreet([
      seg('sidewalk', 3),
      seg('sidewalk-tree', 1),
      seg('bike-lane', 2),
      seg('divider', 0.5),
      seg('parking-lane', 2.5),
      seg('drive-lane', 3),
      seg('drive-lane', 3),
      seg('parking-lane', 2.5),
      seg('divider', 0.5),
      seg('bike-lane', 2),
      seg('sidewalk-tree', 1),
      seg('crosswalk', 3),
      seg('sidewalk', 3),
    ])

    const low = getQualityScore(lowStreet)
    const high = getQualityScore(highStreet)
    expect(high.overall).toBeGreaterThan(low.overall)
    expect(high.grade.charCodeAt(0)).toBeLessThanOrEqual(
      low.grade.charCodeAt(0)
    )
  })
})

import reducer, {
  enableSlicedView,
  disableSlicedView,
  addSlice,
  setActiveSliceId,
  removeSlice,
  renameSlice,
  setSliceLength,
  syncSegmentsToActiveSlice,
} from '../slicedView'

const seg = (type, width) => ({
  id: type,
  type,
  variantString: '',
  width,
  elevation: 0,
  slope: { on: false, values: [] },
  variant: {},
  warnings: [],
})

const sampleSegments = [seg('sidewalk', 3), seg('drive-lane', 3)]

describe('slicedView reducer', () => {
  it('starts disabled with no slices', () => {
    const state = reducer(undefined, { type: '@@INIT' })
    expect(state.enabled).toBe(false)
    expect(state.slices).toEqual([])
    expect(state.activeSliceId).toBeNull()
  })

  it('enableSlicedView creates one slice from current segments', () => {
    const state = reducer(undefined, enableSlicedView(sampleSegments))
    expect(state.enabled).toBe(true)
    expect(state.slices).toHaveLength(1)
    expect(state.slices[0].segments).toEqual(sampleSegments)
    expect(state.activeSliceId).toBe(state.slices[0].id)
    expect(typeof state.slices[0].name).toBe('string')
  })

  it('addSlice adds a new slice and makes it active', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    const firstId = state.slices[0].id
    state = reducer(state, addSlice([seg('bike-lane', 2)]))
    expect(state.slices).toHaveLength(2)
    expect(state.slices[1].segments).toEqual([seg('bike-lane', 2)])
    expect(state.activeSliceId).toBe(state.slices[1].id)
    expect(state.activeSliceId).not.toBe(firstId)
  })

  it('setActiveSliceId switches the active id', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    state = reducer(state, addSlice([seg('bike-lane', 2)]))
    const firstId = state.slices[0].id
    state = reducer(state, setActiveSliceId(firstId))
    expect(state.activeSliceId).toBe(firstId)
  })

  it('removeSlice drops a slice and falls back to the first one', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    state = reducer(state, addSlice([seg('bike-lane', 2)]))
    const firstId = state.slices[0].id
    const secondId = state.slices[1].id
    state = reducer(state, removeSlice(secondId))
    expect(state.slices).toHaveLength(1)
    expect(state.activeSliceId).toBe(firstId)
  })

  it('removing the last slice disables the view', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    const onlyId = state.slices[0].id
    state = reducer(state, removeSlice(onlyId))
    expect(state.enabled).toBe(false)
    expect(state.activeSliceId).toBeNull()
  })

  it('renameSlice updates a slice name', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    const id = state.slices[0].id
    state = reducer(state, renameSlice({ id, name: '新名稱' }))
    expect(state.slices[0].name).toBe('新名稱')
  })

  it('setSliceLength clamps to a minimum of 10m', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    const id = state.slices[0].id
    state = reducer(state, setSliceLength({ id, lengthMeters: 5 }))
    expect(state.slices[0].lengthMeters).toBe(10)
    state = reducer(state, setSliceLength({ id, lengthMeters: 250 }))
    expect(state.slices[0].lengthMeters).toBe(250)
  })

  it('syncSegmentsToActiveSlice writes to the active slice only', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    const newSegs = [seg('parklet', 4)]
    state = reducer(state, syncSegmentsToActiveSlice(newSegs))
    expect(state.slices[0].segments).toEqual(newSegs)
  })

  it('syncSegmentsToActiveSlice is a no-op when disabled', () => {
    let state = reducer(undefined, { type: '@@INIT' })
    state = reducer(state, syncSegmentsToActiveSlice([seg('foo', 1)]))
    expect(state.slices).toEqual([])
  })

  it('disableSlicedView clears state', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    state = reducer(state, disableSlicedView())
    expect(state.enabled).toBe(false)
    expect(state.slices).toEqual([])
    expect(state.activeSliceId).toBeNull()
  })

  it('gives sequential names to multiple slices', () => {
    let state = reducer(undefined, enableSlicedView(sampleSegments))
    state = reducer(state, addSlice(sampleSegments))
    state = reducer(state, addSlice(sampleSegments))
    const names = state.slices.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length) // unique
  })
})

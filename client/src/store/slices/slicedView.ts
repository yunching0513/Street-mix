import { createSlice, nanoid } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

import type { Segment } from '@streetmix/types'

/**
 * Sliced View — 2.5D extension
 *
 * Streetmix's data model assumes one cross-section per street. This
 * slice keeps a client-side collection of additional cross-sections
 * ("slices") along the street's length so the editor can represent
 * how a street's design varies between intersections, schools,
 * commercial blocks, etc.
 *
 * Each slice owns a snapshot of segment widths/types/variants and a
 * length along the street. The slice that is currently "active" maps
 * to the live `street.segments` state so the regular editor, drag-
 * and-drop, info bubbles, and quality scoring all keep working with
 * no further changes.
 *
 * Switching slices is handled by the `switchSlice` thunk in
 * ./actions/slicedView.ts — it saves the current segments back to
 * the previously active slice and loads the new slice's segments
 * into `state.street.segments`.
 */

export interface StreetSlice {
  id: string
  name: string
  lengthMeters: number
  segments: Segment[]
}

interface SlicedViewState {
  enabled: boolean
  activeSliceId: string | null
  slices: StreetSlice[]
}

const initialState: SlicedViewState = {
  enabled: false,
  activeSliceId: null,
  slices: [],
}

const SLICE_NAMES = [
  '入口段',
  '商店段',
  '學校段',
  '路口段',
  '住宅段',
  '辦公段',
  '公園段',
  '車站段',
]

function nextSliceName(existing: StreetSlice[]): string {
  for (const n of SLICE_NAMES) {
    if (!existing.some((s) => s.name === n)) return n
  }
  return `Slice ${existing.length + 1}`
}

const slicedViewSlice = createSlice({
  name: 'slicedView',
  initialState,
  reducers: {
    enableSlicedView: {
      reducer(
        state,
        action: PayloadAction<{ id: string; segments: Segment[] }>
      ) {
        state.enabled = true
        state.slices = [
          {
            id: action.payload.id,
            name: nextSliceName([]),
            lengthMeters: 100,
            segments: action.payload.segments,
          },
        ]
        state.activeSliceId = action.payload.id
      },
      prepare(segments: Segment[]) {
        return { payload: { id: nanoid(), segments } }
      },
    },

    disableSlicedView(state) {
      state.enabled = false
      state.slices = []
      state.activeSliceId = null
    },

    addSlice: {
      reducer(
        state,
        action: PayloadAction<{ id: string; segments: Segment[] }>
      ) {
        const newSlice: StreetSlice = {
          id: action.payload.id,
          name: nextSliceName(state.slices),
          lengthMeters: 80,
          segments: action.payload.segments,
        }
        state.slices.push(newSlice)
        state.activeSliceId = newSlice.id
      },
      prepare(segments: Segment[]) {
        return { payload: { id: nanoid(), segments } }
      },
    },

    setActiveSliceId(state, action: PayloadAction<string>) {
      state.activeSliceId = action.payload
    },

    removeSlice(state, action: PayloadAction<string>) {
      const idx = state.slices.findIndex((s) => s.id === action.payload)
      if (idx === -1) return
      state.slices.splice(idx, 1)
      if (state.activeSliceId === action.payload) {
        state.activeSliceId = state.slices[0]?.id ?? null
      }
      if (state.slices.length === 0) {
        state.enabled = false
      }
    },

    renameSlice(state, action: PayloadAction<{ id: string; name: string }>) {
      const slice = state.slices.find((s) => s.id === action.payload.id)
      if (slice) slice.name = action.payload.name
    },

    setSliceLength(
      state,
      action: PayloadAction<{ id: string; lengthMeters: number }>
    ) {
      const slice = state.slices.find((s) => s.id === action.payload.id)
      if (slice) {
        slice.lengthMeters = Math.max(
          10,
          Math.round(action.payload.lengthMeters)
        )
      }
    },

    syncSegmentsToActiveSlice(state, action: PayloadAction<Segment[]>) {
      if (!state.enabled || state.activeSliceId === null) return
      const slice = state.slices.find((s) => s.id === state.activeSliceId)
      if (slice) slice.segments = action.payload
    },
  },
})

export const {
  enableSlicedView,
  disableSlicedView,
  addSlice,
  setActiveSliceId,
  removeSlice,
  renameSlice,
  setSliceLength,
  syncSegmentsToActiveSlice,
} = slicedViewSlice.actions

export default slicedViewSlice.reducer

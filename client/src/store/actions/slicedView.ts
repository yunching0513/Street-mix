import clone from 'just-clone'

import { recalculateWidth } from '~/src/streets/width.js'
import { applyWarningsToSlices } from '~/src/streets/warnings.js'
import { updateSegments } from '../slices/street.js'
import {
  enableSlicedView,
  disableSlicedView,
  addSlice,
  setActiveSliceId,
  removeSlice,
  syncSegmentsToActiveSlice,
} from '../slices/slicedView.js'

import type { Dispatch } from '@reduxjs/toolkit'
import type { RootState } from '../index.js'
import type { Segment } from '@streetmix/types'

/**
 * Replace the live street segments with a fresh set, recompute widths,
 * and apply warnings — same flow as the regular segmentsChanged thunk
 * but takes the segments as an argument so we can switch slices.
 */
function loadSegmentsIntoStreet(segments: Segment[]) {
  return async (dispatch: Dispatch, getState: () => RootState) => {
    const street = getState().street

    const next = { ...street, segments: clone(segments) }
    const calculatedWidths = recalculateWidth(next)
    const sliced = applyWarningsToSlices(
      clone(segments).map((s) => ({ ...s, warnings: [false] })),
      next,
      calculatedWidths
    )

    await dispatch(
      updateSegments(
        sliced,
        calculatedWidths.occupiedWidth.toNumber(),
        calculatedWidths.remainingWidth.toNumber()
      )
    )
  }
}

/**
 * Turn sliced view on. Captures the current street segments as the
 * first slice ("A").
 */
export function enableSlicedViewAction() {
  return async (dispatch: Dispatch, getState: () => RootState) => {
    const { segments } = getState().street
    await dispatch(enableSlicedView(clone(segments)))
  }
}

/**
 * Turn sliced view off — just resets local state; the active
 * cross-section remains on `state.street`.
 */
export function disableSlicedViewAction() {
  return async (dispatch: Dispatch) => {
    await dispatch(disableSlicedView())
  }
}

/**
 * Snapshot current segments back into the previously-active slice,
 * then load the new slice's segments into the live street state.
 */
export function switchSliceAction(targetId: string) {
  return async (dispatch: Dispatch, getState: () => RootState) => {
    const state = getState()
    const { activeSliceId, slices } = state.slicedView
    const liveSegments = state.street.segments

    if (activeSliceId !== null) {
      // Save live edits back to the previously active slice.
      await dispatch(syncSegmentsToActiveSlice(clone(liveSegments)))
    }

    const target = slices.find((s) => s.id === targetId)
    if (target === undefined) return

    await dispatch(setActiveSliceId(targetId))
    await dispatch(loadSegmentsIntoStreet(target.segments))
  }
}

/**
 * Create a new slice cloned from the currently active one, then
 * switch to it so the user can start editing immediately.
 */
export function addSliceAction() {
  return async (dispatch: Dispatch, getState: () => RootState) => {
    // Snapshot the live segments back to the previously active slice
    // before creating the new one, so no edits are lost.
    const state = getState()
    if (state.slicedView.activeSliceId !== null) {
      await dispatch(syncSegmentsToActiveSlice(clone(state.street.segments)))
    }
    await dispatch(addSlice(clone(state.street.segments)))
  }
}

export function removeSliceAction(id: string) {
  return async (dispatch: Dispatch, getState: () => RootState) => {
    const state = getState()
    const isActive = state.slicedView.activeSliceId === id
    await dispatch(removeSlice(id))

    if (isActive) {
      const next = getState().slicedView
      if (next.activeSliceId !== null) {
        const target = next.slices.find((s) => s.id === next.activeSliceId)
        if (target) await dispatch(loadSegmentsIntoStreet(target.segments))
      }
    }
  }
}

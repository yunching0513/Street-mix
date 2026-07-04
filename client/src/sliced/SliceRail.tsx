import { useDispatch, useSelector } from '~/src/store/hooks.js'
import { getQualityScore } from '~/src/segments/quality_score.js'
import {
  addSliceAction,
  disableSlicedViewAction,
  enableSlicedViewAction,
  removeSliceAction,
  switchSliceAction,
} from '~/src/store/actions/slicedView.js'
import { setSliceLength, renameSlice } from '~/src/store/slices/slicedView.js'
import { MiniSection } from './MiniSection.js'
import './SliceRail.css'

import type { StreetSlice } from '~/src/store/slices/slicedView.js'

function SliceCard({
  slice,
  index,
  isActive,
  isOnly,
  liveSegments,
  onClick,
  onRemove,
  onLengthChange,
  onRename,
}: {
  slice: StreetSlice
  index: number
  isActive: boolean
  isOnly: boolean
  liveSegments: StreetSlice['segments']
  onClick: () => void
  onRemove: () => void
  onLengthChange: (m: number) => void
  onRename: (name: string) => void
}) {
  // For the currently-active slice, mirror the live street segments so
  // the thumbnail and score react as the user drags pieces around.
  const segments = isActive ? liveSegments : slice.segments
  const score = getQualityScore({ segments } as never)
  const pinLetter = String.fromCharCode(65 + index)

  return (
    <div
      className={`slice-card ${isActive ? 'slice-card-active' : ''}`}
      onClick={onClick}
    >
      <div className="slice-card-head">
        <span
          className={`slice-card-pin ${isActive ? 'slice-card-pin-active' : ''}`}
        >
          {pinLetter}
        </span>
        <input
          className="slice-card-name"
          value={slice.name}
          onChange={(e) => onRename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        {!isOnly && (
          <button
            className="slice-card-remove"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title="Remove this slice"
          >
            ×
          </button>
        )}
      </div>
      <MiniSection segments={segments} />
      <div className="slice-card-meta">
        <label
          className="slice-card-length"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="number"
            min="10"
            max="500"
            step="10"
            value={slice.lengthMeters}
            onChange={(e) => onLengthChange(Number(e.target.value))}
          />
          <span>m</span>
        </label>
        <span
          className={`slice-card-score qs-rating-${score.subscores[0].rating}`}
        >
          {score.grade} · {score.overall}
        </span>
      </div>
    </div>
  )
}

export function SliceRail() {
  const dispatch = useDispatch()
  const enabled = useSelector((state) => state.slicedView.enabled)
  const slices = useSelector((state) => state.slicedView.slices)
  const activeSliceId = useSelector((state) => state.slicedView.activeSliceId)
  const liveSegments = useSelector((state) => state.street.segments)

  if (!enabled) {
    return (
      <button
        className="slice-rail-toggle"
        onClick={() => dispatch(enableSlicedViewAction())}
        title="2.5D Sliced View — give one street multiple cross-sections"
      >
        <span className="slice-rail-toggle-seal" aria-hidden="true" />
        2.5D 沿街變化
      </button>
    )
  }

  return (
    <div className="slice-rail">
      <div className="slice-rail-header">
        <div>
          <span className="slice-rail-eyebrow">2.5D 沿街變化</span>
          <span className="slice-rail-title">
            {slices.length} 段剖面 ·{' '}
            {slices.reduce((sum, s) => sum + s.lengthMeters, 0)}m 街道
          </span>
        </div>
        <button
          className="slice-rail-close"
          onClick={() => dispatch(disableSlicedViewAction())}
          title="關閉沿街變化模式"
        >
          ×
        </button>
      </div>
      <div className="slice-rail-cards">
        {slices.map((s, i) => (
          <SliceCard
            key={s.id}
            slice={s}
            index={i}
            isActive={s.id === activeSliceId}
            isOnly={slices.length === 1}
            liveSegments={liveSegments}
            onClick={() => {
              if (s.id !== activeSliceId) dispatch(switchSliceAction(s.id))
            }}
            onRemove={() => dispatch(removeSliceAction(s.id))}
            onLengthChange={(m) =>
              dispatch(setSliceLength({ id: s.id, lengthMeters: m }))
            }
            onRename={(name) => dispatch(renameSlice({ id: s.id, name }))}
          />
        ))}
        <button
          className="slice-card slice-card-add"
          onClick={() => dispatch(addSliceAction())}
        >
          <div className="slice-card-add-plus">+</div>
          <div>新增剖面</div>
        </button>
      </div>
    </div>
  )
}

import { useDispatch, useSelector } from '~/src/store/hooks.js'
import { showDialog } from '~/src/store/slices/dialogs.js'
import './StreetscapeRenderButton.css'

export function StreetscapeRenderButton() {
  const dispatch = useDispatch()
  const segmentCount = useSelector(
    (state) => state.street.segments?.length ?? 0
  )

  if (segmentCount === 0) return null

  return (
    <button
      className="streetscape-render-button"
      onClick={() => dispatch(showDialog('STREETSCAPE_RENDER'))}
      title="AI Streetscape Render — generate a perspective view of this design"
    >
      <span className="srb-seal" aria-hidden="true" />
      AI 街景
    </button>
  )
}

import { useEffect, useState } from 'react'

import { useSelector } from '~/src/store/hooks.js'
import { requestAIRender } from '~/src/streetscape/api.js'
import type {
  CameraAngle,
  TimeOfDay,
} from '~/src/streetscape/perspective_render.js'
import type { RenderResult } from '~/src/streetscape/api.js'
import { Dialog } from '../Dialog.js'
import './StreetscapeRenderDialog.css'

const TIME_OPTIONS: Array<{ value: TimeOfDay; label: string }> = [
  { value: 'day', label: '☀ 白天 · 晴' },
  { value: 'sunset', label: '🌇 黃昏' },
  { value: 'night', label: '🌙 夜晚' },
  { value: 'rain', label: '🌧 雨天' },
]

const CAMERA_OPTIONS: Array<{ value: CameraAngle; label: string }> = [
  { value: 'pedestrian', label: '📷 行人視角' },
  { value: 'cyclist', label: '🚲 自行車視角' },
  { value: 'driver', label: '🚗 駕駛視角' },
  { value: 'aerial', label: '🦅 鳥瞰' },
]

export function StreetscapeRenderDialog() {
  const street = useSelector((state) => state.street)
  const [time, setTime] = useState<TimeOfDay>('day')
  const [camera, setCamera] = useState<CameraAngle>('pedestrian')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<RenderResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function render(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const r = await requestAIRender({
        segments: street.segments ?? [],
        time,
        camera,
        streetName: street.name ?? undefined,
        notes,
      })
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Auto-render on mount so the dialog isn't empty.
  useEffect(() => {
    void render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function downloadImage(): void {
    if (result === null) return
    const a = document.createElement('a')
    a.href = result.imageSrc
    a.download = `${street.name ?? 'streetmix'}-render.svg`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Dialog>
      {(closeDialog) => (
        <div className="streetscape-render-dialog">
          <header>
            <h1>
              <span className="ssr-eyebrow">AI 街景渲染</span>
              Streetscape Render
            </h1>
          </header>
          <div className="dialog-content">
            <div className="ssr-controls">
              <select
                className="ssr-dropdown"
                value={time}
                onChange={(e) => setTime(e.target.value as TimeOfDay)}
              >
                {TIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="ssr-dropdown"
                value={camera}
                onChange={(e) => setCamera(e.target.value as CameraAngle)}
              >
                {CAMERA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="ssr-generate"
                onClick={render}
                disabled={loading}
              >
                {loading ? '生成中…' : '✨ 重新生成'}
              </button>
            </div>

            <div className="ssr-preview">
              {loading && (
                <div className="ssr-loading">
                  <div className="ssr-spinner" />
                  <div>正在生成街景…</div>
                </div>
              )}
              {!loading && error !== null && (
                <div className="ssr-error">渲染失敗：{error}</div>
              )}
              {!loading && error === null && result !== null && (
                <img
                  src={result.imageSrc}
                  alt="Streetscape render"
                  className="ssr-image"
                />
              )}
            </div>

            <div className="ssr-notes-row">
              <label htmlFor="ssr-notes">提示詞（選填）</label>
              <input
                id="ssr-notes"
                type="text"
                className="ssr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例如：人潮聚集、夏季、東南亞氣候"
              />
            </div>

            {result !== null && (
              <details className="ssr-prompt-details">
                <summary>
                  生成提示詞 · provider:{' '}
                  <span className="ssr-provider">{result.provider}</span> ·{' '}
                  {result.latencyMs}ms
                </summary>
                <div className="ssr-prompt-text">{result.prompt}</div>
              </details>
            )}

            <div className="ssr-disclaimer">
              目前為離線模式（client-side SVG perspective）。可在{' '}
              <code>client/src/streetscape/api.ts</code> 替換為真實 image
              model（Anthropic / Stability / Replicate）。
            </div>

            <div className="ssr-actions">
              <button
                className="ssr-btn-ghost"
                onClick={downloadImage}
                disabled={result === null}
              >
                📥 下載渲染圖
              </button>
              <button className="ssr-btn-primary" onClick={closeDialog}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

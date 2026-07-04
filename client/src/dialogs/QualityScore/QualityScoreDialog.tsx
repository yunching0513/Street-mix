import { useMemo } from 'react'

import { useSelector } from '~/src/store/hooks.js'
import { getQualityScore } from '~/src/segments/quality_score.js'
import type {
  QualityScoreData,
  Subscore,
} from '~/src/segments/quality_score.js'
import { Dialog } from '../Dialog.js'
import './QualityScoreDialog.css'

// Shinayaka: gold-brown roman numerals as category marks, in place of
// pictorial icons — support numerals, quiet hierarchy.
const CATEGORY_LABELS: Record<
  Subscore['category'],
  { numeral: string; name: string }
> = {
  walkability: { numeral: 'i', name: '步行友善 Walkability' },
  bikeSafety: { numeral: 'ii', name: '自行車安全 Bike Safety' },
  greenCover: { numeral: 'iii', name: '樹蔭綠覆 Green Cover' },
  accessibility: { numeral: 'iv', name: '無障礙 Accessibility' },
  visionZero: { numeral: 'v', name: '交通安全 Vision Zero' },
}

// Almost colourless: deep green for good grades, gold-brown for the
// middle, antique vermilion when attention is needed.
const GRADE_COLORS: Record<string, string> = {
  'A+': 'rgb(46 107 78 / 90%)',
  A: 'rgb(46 107 78 / 90%)',
  'A-': 'rgb(46 107 78 / 90%)',
  'B+': 'rgb(46 107 78 / 75%)',
  B: 'rgb(46 107 78 / 75%)',
  'B-': '#b8a98c',
  'C+': '#b8a98c',
  C: '#b8a98c',
  'C-': 'rgb(166 57 44 / 75%)',
  D: 'rgb(166 57 44 / 90%)',
}

function formatTWD(n: number): string {
  if (n >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `NT$ ${(n / 1_000).toFixed(0)}K`
  return `NT$ ${n}`
}

function GaugeRing({ value, grade }: { value: number; grade: string }) {
  const circumference = 2 * Math.PI * 50
  const offset = circumference * (1 - value / 100)
  const color = GRADE_COLORS[grade] ?? '#b8a98c'

  return (
    <div className="qs-gauge-wrap">
      <svg viewBox="0 0 120 120" className="qs-gauge">
        <circle cx="60" cy="60" r="50" className="qs-gauge-bg" />
        <circle
          cx="60"
          cy="60"
          r="50"
          className="qs-gauge-fg"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="qs-gauge-text">
        <div className="qs-gauge-value">{value}</div>
        <div className="qs-gauge-grade" style={{ color }}>
          {grade}
        </div>
      </div>
    </div>
  )
}

function SubscoreRow({ subscore }: { subscore: Subscore }) {
  const { numeral, name } = CATEGORY_LABELS[subscore.category]
  return (
    <div className="qs-subscore">
      <div className="qs-subscore-row">
        <span className="qs-subscore-label">
          <span className="qs-subscore-numeral">{numeral}</span>
          {name}
        </span>
        <span className={`qs-subscore-value qs-rating-${subscore.rating}`}>
          {subscore.value}
        </span>
      </div>
      <div className="qs-bar">
        <div
          className={`qs-bar-fill qs-rating-${subscore.rating}`}
          style={{ width: `${subscore.value}%` }}
        />
      </div>
      <div className="qs-subscore-hint">{subscore.hint}</div>
    </div>
  )
}

export function QualityScoreDialog() {
  const street = useSelector((state) => state.street)
  const data: QualityScoreData = useMemo(
    () => getQualityScore(street),
    [street]
  )

  return (
    <Dialog>
      {(closeDialog) => (
        <div className="quality-score-dialog">
          <header>
            <h1>
              <span className="qs-header-eyebrow">設計評分 · Score</span>
              Street Quality Score
            </h1>
          </header>
          <div className="dialog-content">
            <div className="qs-overview">
              <GaugeRing value={data.overall} grade={data.grade} />
              <div className="qs-overview-text">
                <div className="qs-overview-label">整體分數</div>
                <div className="qs-overview-caption">
                  五項指標加權平均——步行、自行車、樹蔭、無障礙、交通安全。層次靠空間，分數靠設計。
                </div>
              </div>
            </div>

            <div className="qs-subscores">
              {data.subscores.map((s) => (
                <SubscoreRow key={s.category} subscore={s} />
              ))}
            </div>

            <div className="qs-metrics">
              <div className="qs-metric">
                <div className="qs-metric-label">估算建造成本</div>
                <div className="qs-metric-value">
                  {formatTWD(data.cost.per100mTWD)}
                </div>
                <div className="qs-metric-sub">每 100m，含一年維護</div>
              </div>
              <div className="qs-metric">
                <div className="qs-metric-label">建造期碳排</div>
                <div className="qs-metric-value">
                  {data.carbon.constructionTonsPer100m} tCO₂e
                </div>
                <div className="qs-metric-sub">每 100m，含行道樹抵減</div>
              </div>
            </div>

            {data.suggestions.length > 0 && (
              <div className="qs-suggestions">
                <div className="qs-suggestions-title">改善建議</div>
                <ul>
                  {data.suggestions.map((sug, i) => (
                    <li key={i}>{sug}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="qs-disclaimer">
              評分為示意值，採 NACTO / Complete Streets
              原則計算。實際工程數值請以專業評估為準。
            </div>
          </div>
          <button className="dialog-primary-action" onClick={closeDialog}>
            關閉 Close
          </button>
        </div>
      )}
    </Dialog>
  )
}

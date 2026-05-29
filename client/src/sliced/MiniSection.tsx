import type { Segment } from '@streetmix/types'

const COLOR_BY_TYPE: Record<string, string> = {
  sidewalk: '#d6d2c5',
  'sidewalk-tree': '#b6c8a3',
  'sidewalk-bench': '#d6d2c5',
  'sidewalk-bike-rack': '#d6d2c5',
  'sidewalk-lamp': '#d6d2c5',
  'sidewalk-wayfinding': '#d6d2c5',
  'outdoor-dining': '#e0c8a0',
  parklet: '#88b56e',
  crosswalk: '#f0e8d8',
  'bike-lane': '#c44a36',
  bikeshare: '#c44a36',
  scooter: '#c44a36',
  'drive-lane': '#4a4f55',
  'turn-lane': '#5a5f65',
  'parking-lane': '#b8b4a6',
  'flex-zone': '#a09c8c',
  'flex-zone-curb': '#a09c8c',
  'bus-lane': '#c8443b',
  'brt-lane': '#d05545',
  'brt-station': '#e8b94a',
  streetcar: '#7a6a5a',
  'light-rail': '#7a6a5a',
  'transit-shelter': '#a89880',
  divider: '#7a8a4a',
  bioswale: '#5a8a4a',
  'drainage-channel': '#6c8da8',
  guardrail: '#888',
  wall: '#999',
}

interface Props {
  segments: Segment[]
  height?: number
}

export function MiniSection({ segments, height = 24 }: Props) {
  const total = segments.reduce((sum, s) => sum + (s.width ?? 0), 0) || 1
  return (
    <div className="mini-section" style={{ height }}>
      {segments.map((s, i) => {
        const color = COLOR_BY_TYPE[s.type] ?? '#888'
        const width = ((s.width ?? 0) / total) * 100
        return (
          <div
            key={i}
            className="mini-section-seg"
            style={{ width: `${width}%`, background: color }}
            title={`${s.type} · ${s.width?.toFixed(1)}m`}
          />
        )
      })}
    </div>
  )
}

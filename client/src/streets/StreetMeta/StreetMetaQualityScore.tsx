import { useMemo } from 'react'

import { useSelector, useDispatch } from '~/src/store/hooks.js'
import { showDialog } from '~/src/store/slices/dialogs.js'
import { getQualityScore } from '~/src/segments/quality_score.js'
import { Icon } from '~/src/ui/Icon.js'
import { StreetMetaItem } from './StreetMetaItem.js'

export function StreetMetaQualityScore() {
  const street = useSelector((state) => state.street)
  const dispatch = useDispatch()

  const { overall, grade } = useMemo(() => getQualityScore(street), [street])

  if ((street.segments?.length ?? 0) === 0) return null

  return (
    <StreetMetaItem
      isEditable
      tooltip="Street Quality Score"
      onClick={() => dispatch(showDialog('QUALITY_SCORE'))}
      icon={<Icon name="star" />}
    >
      <span className="underline">
        評分 {overall} · {grade}
      </span>
    </StreetMetaItem>
  )
}

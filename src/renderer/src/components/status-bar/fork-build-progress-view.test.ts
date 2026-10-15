import { describe, expect, it } from 'vitest'
import { describeForkBuildProgress } from './fork-build-progress-view'

const MINUTE = 60_000
const start = 1_000_000

describe('describeForkBuildProgress', () => {
  it('says how many minutes are left and how far along the bar is', () => {
    const view = describeForkBuildProgress(
      { phase: 'build', startedAt: start, estimatedEndAt: start + 10 * MINUTE },
      start + 4 * MINUTE + 10_000
    )
    expect(view.label).toBe('Building · about 6 min left')
    expect(view.tooltip).toBe('4 min elapsed')
    expect(Math.round(view.percent ?? 0)).toBe(42)
  })

  it('names the sync phase and the last minute', () => {
    const view = describeForkBuildProgress(
      { phase: 'sync', startedAt: start, estimatedEndAt: start + MINUTE },
      start + 20_000
    )
    expect(view.label).toBe('Syncing upstream · under a minute left')
    expect(view.tooltip).toBe('Just started')
  })

  it('stops counting down past the estimate', () => {
    const view = describeForkBuildProgress(
      { phase: 'build', startedAt: start, estimatedEndAt: start + MINUTE },
      start + 3 * MINUTE
    )
    expect(view.label).toBe('Building · almost done')
    expect(view.percent).toBe(99)
  })

  it('has no bar while Claude works and a full one before the restart', () => {
    expect(
      describeForkBuildProgress({ phase: 'claude', startedAt: start, estimatedEndAt: null }, start)
        .percent
    ).toBeNull()
    expect(
      describeForkBuildProgress(
        { phase: 'restart', startedAt: start, estimatedEndAt: start + MINUTE },
        start
      )
    ).toMatchObject({ label: 'Restarting soon', percent: 100 })
  })
})

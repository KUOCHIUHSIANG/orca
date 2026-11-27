import { describe, expect, it } from 'vitest'
import { readMondayColumnChange } from './monday-notification-parsing'

const USERS = new Map([['28766460', { id: '28766460', name: 'Heather', isAgent: false }]])

describe('readMondayColumnChange', () => {
  it('reads who an owner change added and when, from monday tick timestamps', () => {
    const change = readMondayColumnChange(
      {
        created_at: '17954123520328872',
        user_id: '28766460',
        data: JSON.stringify({
          pulse_id: 13613649164,
          pulse_name: 'TLS fix',
          column_id: 'person',
          column_type: 'multiple-person',
          value: {
            personsAndTeams: [
              { id: 28766460, kind: 'person' },
              { id: 50798552, kind: 'person' },
              { id: 7, kind: 'team' }
            ]
          },
          previous_value: { personsAndTeams: [{ id: 28766460, kind: 'person' }] }
        })
      },
      USERS
    )
    expect(change).toEqual({
      itemId: '13613649164',
      itemName: 'TLS fix',
      columnId: 'person',
      columnType: 'multiple-person',
      actor: { id: '28766460', name: 'Heather', isAgent: false },
      createdAt: '2026-11-23T05:39:12.032Z',
      addedPersonIds: ['50798552'],
      statusLabel: null,
      statusColor: null
    })
  })

  it('reads the new status label and skips other column types', () => {
    const log = (columnType: string): Record<string, unknown> => ({
      created_at: '17954062020337076',
      user_id: '50798552',
      data: JSON.stringify({
        pulse_id: 13589568228,
        column_id: 'status8',
        column_type: columnType,
        value: { label: { index: 7, text: 'PM Review', style: { color: '#ff6d3b' } } },
        previous_value: null
      })
    })
    expect(readMondayColumnChange(log('color'), USERS)).toMatchObject({
      actor: { id: '50798552', name: null, isAgent: false },
      statusLabel: 'PM Review',
      statusColor: '#ff6d3b',
      addedPersonIds: []
    })
    expect(readMondayColumnChange(log('text'), USERS)).toBeNull()
  })
})

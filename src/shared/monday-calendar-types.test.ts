import { describe, expect, it } from 'vitest'
import {
  findUnrecognizedMondayReferences,
  parseMondayBoardDisplaySettings,
  parseMondayBoardReferences,
  parseMondayDocReferences
} from './monday-calendar-types'

describe('parseMondayBoardReferences', () => {
  it('accepts board URLs and bare ids, deduplicated', () => {
    expect(
      parseMondayBoardReferences(
        'https://autrontech.monday.com/boards/382737576/\n5389515157, https://autrontech.monday.com/boards/382737576/views/1'
      )
    ).toEqual(['382737576', '5389515157'])
  })

  it('ignores text that is neither', () => {
    expect(parseMondayBoardReferences('hello https://example.com/items/12')).toEqual([])
  })
})

describe('parseMondayBoardDisplaySettings', () => {
  it('keeps valid entries and defaults or drops malformed fields', () => {
    expect(
      parseMondayBoardDisplaySettings({
        '5389515157': {
          groupId: 'new_group',
          ignorePeopleFilter: true,
          includeDone: true,
          recentWeeks: 2
        },
        '382737576': { groupId: '', recentWeeks: 0.5 },
        'not-a-board': { includeDone: true },
        '1': null
      })
    ).toEqual({
      '5389515157': {
        groupId: 'new_group',
        ignorePeopleFilter: true,
        includeDone: true,
        recentWeeks: 2
      },
      '382737576': {
        groupId: null,
        ignorePeopleFilter: false,
        includeDone: false,
        recentWeeks: null
      }
    })
    expect(parseMondayBoardDisplaySettings([])).toEqual({})
  })
})

describe('doc references', () => {
  const text =
    'https://autrontech.monday.com/boards/382737576\nhttps://autrontech.monday.com/docs/18414838941\ndocs/42\n5389515157'

  it('keeps docs apart from boards, reading bare numbers as boards', () => {
    expect(parseMondayDocReferences(text)).toEqual(['18414838941', '42'])
    expect(parseMondayBoardReferences(text)).toEqual(['382737576', '5389515157'])
  })

  it('reports tokens that are neither', () => {
    expect(findUnrecognizedMondayReferences(text)).toEqual([])
    expect(
      findUnrecognizedMondayReferences('https://autrontech.monday.com/workspaces/1 382737576')
    ).toEqual(['https://autrontech.monday.com/workspaces/1'])
  })
})

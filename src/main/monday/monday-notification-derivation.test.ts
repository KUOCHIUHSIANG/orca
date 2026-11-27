import { describe, expect, it } from 'vitest'
import {
  deriveMondayNotifications,
  type FeedActor,
  type FeedComment,
  type MondayNotificationFeed
} from './monday-notification-derivation'

const ME = '50798552'
const HEATHER: FeedActor = { id: '28766460', name: 'Heather', isAgent: false }
const OMAR: FeedActor = { id: '69175796', name: 'Omar', isAgent: false }
const AURORA: FeedActor = { id: '117170086', name: 'Aurora', isAgent: true }
const JATER: FeedActor = { id: ME, name: 'Jater', isAgent: false }
const ITEM_URL = 'https://autrontech.monday.com/boards/1/pulses'
const MENTION_ME = `<a class="user_mention_editor router" href="https://autrontech.monday.com/users/${ME}" data-mention-type="User" data-mention-id="${ME}">@Jater</a>`

function comment(
  partial: Partial<FeedComment> & Pick<FeedComment, 'id' | 'itemId' | 'createdAt'>
): FeedComment {
  return { threadId: partial.id, isReply: false, author: HEATHER, bodyHtml: '', ...partial }
}

function feed(partial: Partial<MondayNotificationFeed>): MondayNotificationFeed {
  return {
    comments: [],
    threads: new Map(),
    items: new Map([
      [
        '10',
        {
          id: '10',
          name: 'Others task',
          url: `${ITEM_URL}/10`,
          personIds: [OMAR.id],
          creatorId: HEATHER.id
        }
      ],
      [
        '20',
        { id: '20', name: 'My task', url: `${ITEM_URL}/20`, personIds: [ME], creatorId: HEATHER.id }
      ]
    ]),
    columnChanges: [],
    ...partial
  }
}

describe('deriveMondayNotifications', () => {
  it('notifies people mentions but not agent mentions, and records my own activity', () => {
    const { notifications, recipientActivity } = deriveMondayNotifications(
      feed({
        comments: [
          comment({
            id: '1',
            itemId: '10',
            createdAt: '2026-11-19T06:02:00.000Z',
            bodyHtml: `<p>Please handle&nbsp;it</p><p>\uFEFF${MENTION_ME}\uFEFF thanks</p>`
          }),
          comment({
            id: '2',
            threadId: '1',
            isReply: true,
            itemId: '10',
            createdAt: '2026-11-20T01:00:56.000Z',
            author: AURORA,
            bodyHtml: `<p>Gentle reminder</p>${MENTION_ME}`
          }),
          comment({
            id: '3',
            threadId: '1',
            isReply: true,
            itemId: '10',
            createdAt: '2026-11-21T03:56:24.000Z',
            author: JATER
          })
        ]
      }),
      ME
    )
    expect(notifications).toEqual([
      {
        id: 'update:1',
        kind: 'mention',
        createdAt: '2026-11-19T06:02:00.000Z',
        actorName: 'Heather',
        itemId: '10',
        itemName: 'Others task',
        url: 'https://autrontech.monday.com/boards/1/pulses/10/posts/1',
        excerpt: 'Please handle it @Jater thanks',
        statusColor: null
      }
    ])
    expect([...recipientActivity]).toEqual([['10', Date.parse('2026-11-21T03:56:24.000Z')]])
  })

  it('notifies replies in threads I joined earlier and updates on tasks I own', () => {
    const { notifications } = deriveMondayNotifications(
      feed({
        comments: [
          comment({
            id: '31',
            threadId: '30',
            isReply: true,
            itemId: '10',
            createdAt: '2026-11-22T10:00:00.000Z',
            author: OMAR
          }),
          comment({
            id: '41',
            threadId: '40',
            isReply: true,
            itemId: '10',
            createdAt: '2026-11-22T10:00:00.000Z',
            author: OMAR
          }),
          comment({ id: '50', itemId: '20', createdAt: '2026-11-22T11:00:00.000Z' }),
          comment({ id: '60', itemId: '10', createdAt: '2026-11-22T12:00:00.000Z' })
        ],
        threads: new Map([
          [
            '30',
            {
              creatorId: HEATHER.id,
              replies: [{ creatorId: ME, createdAt: '2026-11-22T09:00:00.000Z' }]
            }
          ],
          // Joined only after Omar's reply, so that reply isn't a thread notification.
          [
            '40',
            {
              creatorId: HEATHER.id,
              replies: [{ creatorId: ME, createdAt: '2026-11-22T11:00:00.000Z' }]
            }
          ]
        ])
      }),
      ME
    )
    expect(notifications.map(({ id, kind, url }) => ({ id, kind, url }))).toEqual([
      {
        id: 'reply:31',
        kind: 'thread-reply',
        url: 'https://autrontech.monday.com/boards/1/pulses/10/posts/30?reply=reply-31'
      },
      {
        id: 'update:50',
        kind: 'task-update',
        url: 'https://autrontech.monday.com/boards/1/pulses/20/posts/50'
      }
    ])
  })

  it('notifies being added as an owner and status changes on my tasks only', () => {
    const change = {
      itemName: null,
      columnType: 'color',
      actor: HEATHER,
      createdAt: '2026-11-22T08:00:00.000Z',
      addedPersonIds: [],
      statusLabel: 'PM Review',
      statusColor: '#ff6d3b'
    }
    const { notifications } = deriveMondayNotifications(
      feed({
        columnChanges: [
          {
            ...change,
            itemId: '10',
            columnId: 'person',
            columnType: 'multiple-person',
            addedPersonIds: [ME],
            statusLabel: null,
            statusColor: null
          },
          { ...change, itemId: '20', columnId: 'status8' },
          { ...change, itemId: '10', columnId: 'status8' },
          { ...change, itemId: '20', columnId: 'status0', actor: JATER }
        ]
      }),
      ME
    )
    expect(
      notifications.map(({ id, kind, excerpt, statusColor }) => ({
        id,
        kind,
        excerpt,
        statusColor
      }))
    ).toEqual([
      {
        id: 'column:10:person:1795334400000',
        kind: 'owner-added',
        excerpt: null,
        statusColor: null
      },
      {
        id: 'column:20:status8:1795334400000',
        kind: 'status-change',
        excerpt: 'PM Review',
        statusColor: '#ff6d3b'
      }
    ])
  })
})

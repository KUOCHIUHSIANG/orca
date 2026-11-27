import { useState } from 'react'
import {
  AppWindow,
  AtSign,
  Bell,
  CheckCheck,
  CircleDot,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  MessageSquareReply,
  RefreshCw,
  UserPlus,
  type LucideIcon
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { useIntlLocale, useTranslate, type Translate } from '@/i18n/use-translate'
import type {
  MondayMarkNotificationsReadArgs,
  MondayNotification,
  MondayNotificationKind
} from '../../../../shared/monday-notification-types'
import { CalendarIconAction } from '../calendar/CalendarIconAction'
import { describeMondayFailure } from './monday-failure-copy'
import { useMondayNotifications } from './use-monday-notifications'

const KIND_ICONS: Record<MondayNotificationKind, LucideIcon> = {
  mention: AtSign,
  'thread-reply': MessageSquareReply,
  'owner-added': UserPlus,
  'task-update': MessageSquare,
  'status-change': CircleDot
}

// Why: freshness for a returning user, who opens the bell after an idle stretch of slow polling.
const STALE_ON_OPEN_MS = 60_000

function notificationTitle(t: Translate, notification: MondayNotification): string {
  const actor =
    notification.actorName ?? t('auto.components.mondayCalendar.notifications.someone', 'Someone')
  switch (notification.kind) {
    case 'mention':
      return t('auto.components.mondayCalendar.notifications.mention', '{{value0}} mentioned you', {
        value0: actor
      })
    case 'thread-reply':
      return t(
        'auto.components.mondayCalendar.notifications.threadReply',
        '{{value0}} replied in a thread you joined',
        { value0: actor }
      )
    case 'owner-added':
      return t(
        'auto.components.mondayCalendar.notifications.ownerAdded',
        '{{value0}} added you as an owner',
        { value0: actor }
      )
    case 'task-update':
      return t(
        'auto.components.mondayCalendar.notifications.taskUpdate',
        '{{value0}} posted on your task',
        { value0: actor }
      )
    case 'status-change':
      return t(
        'auto.components.mondayCalendar.notifications.statusChange',
        '{{value0}} changed the status of your task',
        { value0: actor }
      )
  }
}

function MondayStatusLabel(props: { label: string; color: string | null }): React.JSX.Element {
  // monday's own label color, like the status cell on the board.
  return (
    <span
      className={cn(
        'inline-flex max-w-full rounded-sm px-2 py-0.5 text-2xs font-medium',
        props.color ? 'text-white' : 'bg-muted text-foreground'
      )}
      style={props.color ? { backgroundColor: props.color } : undefined}
    >
      <span className="truncate">{props.label}</span>
    </span>
  )
}

function NotificationRow(props: {
  notification: MondayNotification
  now: number
  onReveal: () => void
  onOpenInOrcaBrowser: () => void
  onOpenInSystemBrowser: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const { notification } = props
  const Icon = KIND_ICONS[notification.kind]
  return (
    <div className="flex items-start gap-1 rounded-md pr-1 focus-within:bg-accent hover:bg-accent">
      <button
        type="button"
        onClick={props.onReveal}
        className="flex min-w-0 flex-1 items-start gap-2.5 py-2 pl-2 text-left focus-visible:outline-none"
      >
        <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className={cn('block text-xs', !notification.read && 'font-medium')}>
            {notificationTitle(t, notification)}
          </span>
          {notification.itemName ? (
            <span className="block truncate text-xs text-muted-foreground">
              {notification.itemName}
            </span>
          ) : null}
          {notification.kind === 'status-change' && notification.excerpt ? (
            <MondayStatusLabel label={notification.excerpt} color={notification.statusColor} />
          ) : notification.excerpt ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {notification.excerpt}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 pt-px">
          {notification.read ? null : (
            <span
              role="img"
              aria-label={t('auto.components.mondayCalendar.notifications.unread', 'Unread')}
              className="size-1.5 rounded-full bg-primary"
            />
          )}
          <span className="text-2xs text-muted-foreground tabular-nums">
            {formatUiRelativeTime(Date.parse(notification.createdAt) - props.now, intlLocale)}
          </span>
        </span>
      </button>
      <div className="flex pt-0.5">
        <CalendarIconAction
          label={t('auto.components.mondayCalendar.item.openInOrcaBrowser', 'Open in Orca browser')}
          onClick={props.onOpenInOrcaBrowser}
        >
          <AppWindow className="text-muted-foreground" />
        </CalendarIconAction>
        <CalendarIconAction
          label={t(
            'auto.components.mondayCalendar.item.openInSystemBrowser',
            'Open in system browser'
          )}
          onClick={props.onOpenInSystemBrowser}
        >
          <ExternalLink className="text-muted-foreground" />
        </CalendarIconAction>
      </div>
    </div>
  )
}

function markRead(args: MondayMarkNotificationsReadArgs): void {
  window.api.monday
    .markNotificationsRead(args)
    .catch((error: unknown) => console.error('Failed to mark monday notifications read:', error))
}

function EmptyState(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-xs text-muted-foreground">
      {props.children}
    </div>
  )
}

export function MondayNotificationsButton(props: {
  /** Finds the task on the calendar, or opens it in the Orca browser when it isn't there. */
  onRevealNotification: (notification: MondayNotification) => void
  onOpenInOrcaBrowser: (notification: MondayNotification) => void
  onOpenSettings: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const state = useMondayNotifications()
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // Relative times only need to be right when the list is shown, so no ticking clock.
  const [now, setNow] = useState(() => Date.now())
  if (!state) {
    return null
  }
  const unread = state.unreadCount
  const label = t('auto.components.mondayCalendar.notifications.title', 'Notifications')

  const refresh = (): void => {
    setRefreshing(true)
    void window.api.monday
      .refreshNotifications()
      .catch((error: unknown) => console.error('Failed to refresh monday notifications:', error))
      .finally(() => setRefreshing(false))
  }

  const changeOpen = (next: boolean): void => {
    setOpen(next)
    if (!next) {
      return
    }
    const openedAt = Date.now()
    setNow(openedAt)
    if (state.enabled && openedAt - (state.checkedAt ?? 0) > STALE_ON_OPEN_MS) {
      refresh()
    }
  }

  const openNotification = (
    notification: MondayNotification,
    target: 'calendar' | 'orca-browser' | 'system-browser'
  ): void => {
    setOpen(false)
    if (!notification.read) {
      markRead({ ids: [notification.id] })
    }
    if (target === 'calendar') {
      props.onRevealNotification(notification)
    } else if (target === 'orca-browser') {
      props.onOpenInOrcaBrowser(notification)
    } else {
      openAppHttpLink(notification.url, { destination: 'system' })
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={
                unread > 0
                  ? t(
                      'auto.components.mondayCalendar.notifications.titleWithUnread',
                      'Notifications, {{value0}} unread',
                      { value0: unread }
                    )
                  : label
              }
            >
              <Bell />
              {unread > 0 ? (
                <Badge className="pointer-events-none absolute -top-1 -right-1 h-4 min-w-4 px-1 py-0 text-3xs tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-1 border-b border-border py-1.5 pr-1.5 pl-3">
          <h2 className="flex-1 text-sm font-semibold">{label}</h2>
          {state.enabled ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={unread === 0}
                onClick={() => markRead({ all: true })}
              >
                <CheckCheck />
                {t('auto.components.mondayCalendar.notifications.markAllRead', 'Mark all read')}
              </Button>
              <CalendarIconAction
                label={t('auto.components.mondayCalendar.notifications.refresh', 'Check now')}
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshCw className={cn(refreshing && 'animate-spin')} />
              </CalendarIconAction>
            </>
          ) : null}
        </div>
        {!state.enabled ? (
          <EmptyState>
            <p>
              {t(
                'auto.components.mondayCalendar.notifications.chooseRecipient',
                'Choose who you are in monday.com to see your notifications. The API token can belong to someone else.'
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false)
                props.onOpenSettings()
              }}
            >
              {t('auto.components.mondayCalendar.toolbar.settings', 'Monday settings')}
            </Button>
          </EmptyState>
        ) : state.notifications.length === 0 ? (
          <EmptyState>
            {state.checkedAt === null && !state.error ? (
              <span className="flex items-center gap-2">
                <LoaderCircle className="size-3.5 animate-spin" />
                {t('auto.components.mondayCalendar.notifications.checking', 'Checking…')}
              </span>
            ) : (
              t(
                'auto.components.mondayCalendar.notifications.empty',
                'No notifications in the last 14 days.'
              )
            )}
          </EmptyState>
        ) : (
          <div className="scrollbar-sleek max-h-[26rem] overflow-y-auto p-1">
            {state.notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                now={now}
                onReveal={() => openNotification(notification, 'calendar')}
                onOpenInOrcaBrowser={() => openNotification(notification, 'orca-browser')}
                onOpenInSystemBrowser={() => openNotification(notification, 'system-browser')}
              />
            ))}
          </div>
        )}
        {state.enabled && (state.error || state.checkedAt !== null) ? (
          <p
            role={state.error ? 'alert' : undefined}
            className={cn(
              'border-t border-border px-3 py-1.5 text-2xs',
              state.error ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {state.error
              ? describeMondayFailure(state.error)
              : t('auto.components.mondayCalendar.notifications.checked', 'Checked {{value0}}', {
                  value0: formatUiRelativeTime((state.checkedAt ?? now) - now, intlLocale)
                })}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

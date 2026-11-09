import { translate } from '@/i18n/i18n'
import type { DetachedPage } from '../../../../shared/detached-pages'

export type DetachablePage = Exclude<DetachedPage, 'monday-task'>

export function detachedPageLabel(page: DetachablePage): string {
  switch (page) {
    case 'monday':
      return translate('auto.components.sidebar.SidebarNav.monday', 'Monday')
    case 'todo':
      return translate('auto.components.sidebar.SidebarNav.todo', 'To Do')
    case 'servers':
      return translate('auto.components.sidebar.SidebarNav.servers', 'Servers')
  }
}

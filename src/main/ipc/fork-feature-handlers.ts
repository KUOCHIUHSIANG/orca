import type { Store } from '../persistence/loading-store/store'
import type { KeybindingService } from '../keybindings/keybinding-service'
import { registerMondayHandlers } from './monday'
import { registerMicrosoftTodoHandlers } from './microsoft-todo'
import { registerServerFilesHandlers } from '../server-files/server-files-ipc'
import { registerDetachedPagesHandlers } from './detached-pages'
import { browserSessionRegistry } from '../browser/sessions/profiles/browser-session-registry'

/** The fork's own pages and their windows, kept out of upstream's (full) core handler list. */
export function registerForkFeatureHandlers(store: Store, keybindings?: KeybindingService): void {
  registerMondayHandlers()
  registerMicrosoftTodoHandlers()
  registerServerFilesHandlers()
  registerDetachedPagesHandlers(
    store,
    keybindings,
    () => browserSessionRegistry.getDefaultProfile().partition
  )
}

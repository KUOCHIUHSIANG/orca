import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree,
  GOLDEN_CHANGED_PATH
} from './helpers/golden-source-control'
import { getActiveWorktreeId, waitForSessionReady } from './helpers/store'

const DELETION_PATH = 'src/git-change-deletion.ts'

async function openEditTab(
  page: Page,
  worktreeId: string,
  worktreePath: string,
  relativePath: string
): Promise<void> {
  await page.evaluate(
    ({ wId, root, relPath }) => {
      const separator = root.includes('\\') ? '\\' : '/'
      window.__store?.getState().openFile({
        filePath: `${root}${separator}${relPath.split('/').join(separator)}`,
        relativePath: relPath,
        worktreeId: wId,
        language: 'typescript',
        mode: 'edit'
      })
    },
    { wId: worktreeId, root: worktreePath, relPath: relativePath }
  )
}

test('editor gutter marks uncommitted lines and opens an inline diff on click', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const fixture = createGoldenWorktree(testRepoPath, 'git-change-gutter')
  registerPostElectronShutdownCleanup(async () => cleanupGoldenWorktree(testRepoPath, fixture))
  const deletionFile = path.join(fixture.worktreePath, DELETION_PATH)
  writeFileSync(deletionFile, 'one\ntwo\nthree\n')
  execFileSync('git', ['add', DELETION_PATH], { cwd: fixture.worktreePath, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', 'Seed git change gutter fixture'], {
    cwd: fixture.worktreePath,
    stdio: 'pipe'
  })
  writeFileSync(deletionFile, 'one\nthree\n')
  // HEAD holds `export const hello = "world"`; the saved edit is a one-line modification.
  writeFileSync(
    path.join(fixture.worktreePath, GOLDEN_CHANGED_PATH),
    'export const hello = "gutter"\n'
  )

  await waitForSessionReady(orcaPage)
  // Why: the host OS locale drives the default UI language; pin English for stable locators.
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await activateGoldenWorktree(orcaPage, testRepoPath, fixture.worktreePath)
  const worktreeId = await getActiveWorktreeId(orcaPage)
  expect(worktreeId).not.toBeNull()
  await openEditTab(orcaPage, worktreeId!, fixture.worktreePath, GOLDEN_CHANGED_PATH)

  const editor = orcaPage.locator('.monaco-editor').first()
  await expect(editor).toContainText('gutter', { timeout: 25_000 })
  const modifiedMarker = editor.locator('.orca-git-change-modified')
  await expect(modifiedMarker).toHaveCount(1, { timeout: 15_000 })

  await modifiedMarker.click()
  const peek = editor.locator('.orca-git-change-peek')
  await expect(peek).toBeVisible()
  await expect(peek).toContainText('Uncommitted changes')
  await expect(peek).toContainText('1 of 1')
  // The inline diff shows the HEAD line next to the edited one.
  const peekDiff = peek.locator('.monaco-diff-editor')
  await expect(peekDiff).toContainText('world', { timeout: 15_000 })
  await expect(peekDiff).toContainText('gutter')

  await peek.getByRole('button', { name: 'Close' }).click()
  await expect(peek).toHaveCount(0)

  // Unsaved typing is marked too, without a save or git status round-trip.
  await editor.locator('.view-lines').click()
  await orcaPage.keyboard.press('ControlOrMeta+End')
  await orcaPage.keyboard.press('Enter')
  await orcaPage.keyboard.type('export const unsaved = true')
  const addedMarker = editor.locator('.orca-git-change-added')
  await expect(addedMarker).toHaveCount(1, { timeout: 10_000 })

  // Reverting the added hunk removes only that line; the saved modification stays marked.
  await addedMarker.click()
  await peek.getByRole('button', { name: 'Revert change' }).click()
  await expect(peek).toHaveCount(0)
  await expect(editor.locator('.view-lines')).not.toContainText('unsaved')
  await expect(addedMarker).toHaveCount(0, { timeout: 10_000 })
  await expect(modifiedMarker).toHaveCount(1)

  // A removed line leaves a marker between its neighbours; its peek shows the HEAD text.
  await openEditTab(orcaPage, worktreeId!, fixture.worktreePath, DELETION_PATH)
  const deletionEditor = orcaPage.locator('.monaco-editor').first()
  await expect(deletionEditor).toContainText('three', { timeout: 25_000 })
  const deletedMarker = deletionEditor.locator('.orca-git-change-deleted')
  await expect(deletedMarker).toHaveCount(1, { timeout: 15_000 })
  await deletedMarker.click()
  const deletionPeek = deletionEditor.locator('.orca-git-change-peek')
  await expect(deletionPeek.locator('.monaco-diff-editor')).toContainText('two', {
    timeout: 15_000
  })

  await deletionPeek.getByRole('button', { name: 'Revert change' }).click()
  await expect(deletionPeek).toHaveCount(0)
  await expect(deletionEditor.locator('.view-lines')).toContainText('two')
  await expect(deletedMarker).toHaveCount(0, { timeout: 10_000 })
})

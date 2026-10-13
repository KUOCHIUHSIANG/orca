import { expect, test } from './helpers/orca-app'
import { clickFileInExplorer, openFileExplorer } from './helpers/file-explorer'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('crosshair re-expands collapsed parents and selects the active editor file', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  // Why: the host OS locale drives the default UI language; pin English for stable locators.
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
  await openFileExplorer(orcaPage)

  const explorer = orcaPage.locator('[data-orca-explorer-shell]')
  await expect(explorer).toBeVisible({ timeout: 10_000 })
  const revealButton = explorer.getByRole('button', { name: 'Reveal Active File' })
  await expect(revealButton).toBeDisabled()

  expect(await clickFileInExplorer(orcaPage, ['src/index.ts'])).toBe('src/index.ts')
  const indexRow = explorer.locator('[data-file-explorer-row]').filter({ hasText: 'index.ts' })
  await expect(revealButton).toBeEnabled({ timeout: 10_000 })
  await expect(indexRow).toBeVisible({ timeout: 10_000 })

  await explorer.getByRole('button', { name: 'Collapse All' }).click()
  await expect(indexRow).toHaveCount(0)

  await revealButton.click()
  await expect(indexRow).toBeVisible({ timeout: 10_000 })
  await expect(indexRow).toHaveAttribute('data-selected', 'true')
  await expect(indexRow).toHaveAttribute('data-flashing', 'true')
  const animationName = (): Promise<string> =>
    indexRow.evaluate((row) => getComputedStyle(row).animationName)
  await expect.poll(animationName).toBe('file-explorer-reveal-flash')

  await expect(indexRow).not.toHaveAttribute('data-flashing', 'true', { timeout: 5_000 })
  await expect.poll(animationName).toBe('none')
})

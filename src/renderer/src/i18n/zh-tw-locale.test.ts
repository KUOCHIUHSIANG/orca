import { beforeEach, describe, expect, it } from 'vitest'

import { UI_LANGUAGE_CHINESE, UI_LANGUAGE_CHINESE_TRADITIONAL } from '../../../shared/ui-language'
import { getIntlLocale, i18n, setRendererPluginLanguagePacks, setRendererUiLanguage } from './i18n'

describe('renderer Traditional Chinese (zh-TW) locale', () => {
  beforeEach(async () => {
    setRendererPluginLanguagePacks([])
    await i18n.changeLanguage('en')
  })

  it('lazy-loads the Traditional catalog instead of the Simplified one', async () => {
    await setRendererUiLanguage(UI_LANGUAGE_CHINESE_TRADITIONAL)
    expect(i18n.language).toBe('zh-TW')
    expect(i18n.t('settings.appearance.language.title', { defaultValue: 'Language' })).toBe('語言')
    expect(getIntlLocale()).toBe('zh-TW')

    await setRendererUiLanguage(UI_LANGUAGE_CHINESE)
    expect(i18n.t('settings.appearance.language.title', { defaultValue: 'Language' })).toBe('语言')
  })
})

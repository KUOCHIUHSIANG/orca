import { beforeEach, describe, expect, it } from 'vitest'

import { UI_LANGUAGE_CHINESE, UI_LANGUAGE_CHINESE_TRADITIONAL } from '../../../shared/ui-language'
import { getIntlLocale, i18n, loadRendererUiLanguage, setRendererPluginLanguagePacks } from './i18n'
import zhTwCatalog from './locales/zh-TW.json'

describe('renderer Traditional Chinese (zh-TW) locale', () => {
  beforeEach(async () => {
    setRendererPluginLanguagePacks([])
    await i18n.changeLanguage('en')
  })

  it('serves the fork zh-TW catalog for zh-Hant instead of the Simplified one', async () => {
    await i18n.changeLanguage(await loadRendererUiLanguage(UI_LANGUAGE_CHINESE_TRADITIONAL))
    expect(i18n.language).toBe('zh-Hant')
    expect(i18n.getResourceBundle('zh-Hant', 'translation')).toEqual(zhTwCatalog)
    expect(i18n.t('settings.appearance.language.title', { defaultValue: 'Language' })).toBe('語言')
    expect(getIntlLocale()).toBe('zh-Hant')

    await i18n.changeLanguage(await loadRendererUiLanguage(UI_LANGUAGE_CHINESE))
    expect(i18n.t('settings.appearance.language.title', { defaultValue: 'Language' })).toBe('语言')
  })
})

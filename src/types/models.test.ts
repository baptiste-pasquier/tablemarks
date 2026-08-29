import { describe, it, expect, afterEach } from 'vitest'
import { mockI18n } from '../test/setup'
import { translateVerdict, translateStatus, VERDICTS, type RestaurantStatus } from './models'

const STATUSES: RestaurantStatus[] = ['to_try', 'visited']

afterEach(async () => {
  await mockI18n.changeLanguage('en')
})

describe('translateVerdict / translateStatus', () => {
  it('resolves every verdict/status through i18next rather than a hardcoded string (English)', async () => {
    await mockI18n.changeLanguage('en')
    expect(translateVerdict('go_back')).toBe('Go back')
    expect(translateVerdict('worth_a_detour')).toBe('Worth a detour')
    expect(translateVerdict('once_was_enough')).toBe('Once was enough')
    expect(translateVerdict('never_again')).toBe('Never again')
    expect(translateStatus('to_try')).toBe('To try')
    expect(translateStatus('visited')).toBe('Visited')
  })

  // R4: exact French wording, case- and apostrophe-sensitive.
  it('renders the exact required French verdict/status wording (R4)', async () => {
    await mockI18n.changeLanguage('fr')
    expect(translateVerdict('go_back')).toBe("J'y retourne")
    expect(translateVerdict('worth_a_detour')).toBe('Vaut le détour')
    expect(translateVerdict('once_was_enough')).toBe('Une fois suffit')
    expect(translateVerdict('never_again')).toBe('Plus jamais')
    expect(translateStatus('to_try')).toBe('à essayer')
    expect(translateStatus('visited')).toBe('visité')
  })

  it('never falls back to a raw translation key for any verdict or status, in either language', async () => {
    for (const lng of ['en', 'fr'] as const) {
      await mockI18n.changeLanguage(lng)
      for (const v of VERDICTS) {
        expect(translateVerdict(v)).not.toContain('verdicts.')
      }
      for (const s of STATUSES) {
        expect(translateStatus(s)).not.toContain('statuses.')
      }
    }
  })
})

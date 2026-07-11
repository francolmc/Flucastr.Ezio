import { describe, it, expect } from 'vitest'
import { getCurrentDateContext } from '../DateContext'

describe('getCurrentDateContext', () => {
  it('returns a string containing the current year', () => {
    const context = getCurrentDateContext()
    const currentYear = new Date().getFullYear()
    expect(context).toContain(String(currentYear))
  })

  it('returns a string containing an ISO date format (YYYY-MM-DD)', () => {
    const context = getCurrentDateContext()
    const isoPattern = /\d{4}-\d{2}-\d{2}/
    expect(context).toMatch(isoPattern)
  })

  it('returns a string containing "Current date:"', () => {
    const context = getCurrentDateContext()
    expect(context).toContain('Current date:')
  })

  it('returns a string containing "Current local time:"', () => {
    const context = getCurrentDateContext()
    expect(context).toContain('Current local time:')
  })

  it('returns a string containing "timezone:"', () => {
    const context = getCurrentDateContext()
    expect(context).toContain('timezone:')
  })
})

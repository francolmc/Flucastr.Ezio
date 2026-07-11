export function getCurrentDateContext(): string {
  const now = new Date()
  const iso = now.toISOString().slice(0, 10)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(now)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
  }).format(now)
  return `Current date: ${formatted} (${iso}). Current local time: ${time} (timezone: ${tz}).`
}

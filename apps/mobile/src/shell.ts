// Mobile dashboard shell: route-restricted build (VITE_DASHBOARD_ONLY=true) so
// invoice-creation UI is NOT shipped, not just hidden (Phase 8 DoD).
// Push stub: registers token with the API for low-stock / order alerts.
import { PushNotifications } from '@capacitor/push-notifications'
import { SplashScreen } from '@capacitor/splash-screen'

export async function initMobile(apiBase: string) {
  await SplashScreen.hide().catch(() => {})
  try {
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive === 'granted') {
      await PushNotifications.register()
      PushNotifications.addListener('registration', async (t) => {
        await fetch(`${apiBase}/mobile/push-token`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t.value, platform: 'android' }),
        }).catch(() => {})
      })
    }
  } catch (e) {
    console.warn('[mobile] push unavailable in this build', e)
  }
}

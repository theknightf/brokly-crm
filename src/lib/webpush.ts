import webpush from 'web-push';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

let configured = false;

/** Lazily configure the singleton sender with our VAPID keys. */
export function getWebPush() {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@brokly.io',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    configured = true;
  }
  return webpush;
}

/** Best-effort push a notification to a single push subscription. */
export async function sendToSubscription(
  sub: PushSubscriptionJson,
  payload: { title: string; body?: string; url?: string; icon?: string; tag?: string }
) {
  try {
    const webpush = getWebPush();
    const res = await webpush.sendNotification(
      sub,
      JSON.stringify({
        title: payload.title,
        body: payload.body || '',
        url: payload.url || '/',
        icon: payload.icon || '/icons/icon-192-v2.png',
        tag: payload.tag || '',
      })
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'statusCode' in e
        ? (e as { statusCode: number }).statusCode
        : 0;
    // 404/410 means the subscription is expired and must be dropped.
    return { ok: false, dropped: code === 404 || code === 410, statusCode: code, error: String(e) };
  }
}

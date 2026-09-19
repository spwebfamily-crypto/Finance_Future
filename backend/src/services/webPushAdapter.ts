import webpush from "web-push";
import { env } from "../config.js";

export type PushSubscriptionAdapter = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

let configured = false;

export function webPushEnabled() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!webPushEnabled() || configured) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Returns false for expired subscriptions, so callers can remove only those. */
export async function deliverWebPush(subscription: PushSubscriptionAdapter, payload: unknown) {
  if (!webPushEnabled()) return { delivered: false, expired: false };
  configureWebPush();
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
    return { delivered: true, expired: false };
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    return { delivered: false, expired: statusCode === 404 || statusCode === 410 };
  }
}

import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notificationApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type { FinancialNotification } from "../types";
import { useI18n } from "../i18n/I18nContext";

export function NotificationCenter({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FinancialNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const panelRef = useRef<HTMLElement>(null);

  async function load() {
    try {
      const next = await notificationApi.list();
      setItems(next.items);
      setUnreadCount(next.unreadCount);
      setError("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void notificationApi.pushConfig().then((config) => setPushAvailable(config.enabled));
      void notificationApi
        .preferences()
        .then((preference) => setInAppEnabled(preference.inAppEnabled));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function markAllRead() {
    try {
      await notificationApi.markAllRead();
      setItems((current) => current.map((item) => ({ ...item, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function enablePush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    setEnablingPush(true);
    try {
      const config = await notificationApi.pushConfig();
      if (!config.enabled || !config.publicKey) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (character) => character.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
      await notificationApi.subscribePush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setEnablingPush(false);
    }
  }

  async function setInAppPreference(next: boolean) {
    setInAppEnabled(next);
    try {
      await notificationApi.savePreferences({ inAppEnabled: next });
    } catch (requestError) {
      setInAppEnabled(!next);
      setError(errorMessage(requestError));
    }
  }

  return (
    <div className="notification-center">
      <button
        className={
          compact
            ? "icon-button notification-trigger notification-trigger--compact"
            : "icon-button notification-trigger"
        }
        type="button"
        aria-label={t("Avisos")}
        aria-expanded={open}
        aria-controls="notification-center-panel"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-trigger__count">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          id="notification-center-panel"
          ref={panelRef}
          className="notification-center__panel"
          role="dialog"
          aria-label={t("Avisos")}
        >
          <header className="notification-center__header">
            <div>
              <strong>{t("Avisos")}</strong>
              <span>
                {unreadCount ? t("{count} por ler", { count: unreadCount }) : t("Tudo visto")}
              </span>
            </div>
            {unreadCount > 0 && (
              <button className="text-button" type="button" onClick={() => void markAllRead()}>
                <CheckCheck aria-hidden="true" /> {t("Marcar como lidos")}
              </button>
            )}
          </header>
          {pushAvailable && "Notification" in window && Notification.permission !== "granted" ? (
            <button
              className="notification-center__push"
              type="button"
              disabled={enablingPush}
              onClick={() => void enablePush()}
            >
              {t("Ativar avisos no dispositivo")}
            </button>
          ) : null}
          <label className="notification-center__preference">
            <input
              type="checkbox"
              checked={inAppEnabled}
              onChange={(event) => void setInAppPreference(event.target.checked)}
            />
            {t("Mostrar avisos na aplicação")}
          </label>
          {error ? <p className="notification-center__error">{error}</p> : null}
          {!error && !items.length ? (
            <p className="notification-center__empty">{t("Ainda não há avisos.")}</p>
          ) : null}
          <div className="notification-center__list">
            {items.map((item) => (
              <button
                key={item.id}
                className={
                  item.readAt ? "notification-item" : "notification-item notification-item--unread"
                }
                type="button"
                onClick={() => {
                  if (item.readAt) return;
                  void notificationApi
                    .markRead(item.id)
                    .then(() => {
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, readAt: new Date().toISOString() }
                            : entry,
                        ),
                      );
                      setUnreadCount((count) => Math.max(0, count - 1));
                    })
                    .catch((requestError) => setError(errorMessage(requestError)));
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

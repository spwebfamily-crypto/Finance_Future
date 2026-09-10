import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Landmark, ReceiptText, X } from "lucide-react";
import { categoryApi, openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { BANK_SYNC_COMPLETED_EVENT } from "../api/bank-sync-events";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";
import type { BankTransaction, Category } from "../types";
import { TiltCard } from "./TiltCard";
import { ConfirmDialog } from "./ConfirmDialog";

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function transactionDate(transaction: BankTransaction) {
  return transaction.bookingDate ?? transaction.valueDate ?? transaction.transactionDate;
}

function formatTransactionDate(transaction: BankTransaction, locale: string, fallback: string) {
  const value = transactionDate(transaction);
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export function DailyBankReviewModal() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const current = transactions[0] ?? null;
  const userId = user?.id;
  const userTimeZone = user?.timeZone ?? "Europe/Lisbon";

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const today = localDateKey(new Date(), userTimeZone);

    async function loadReviewQueue() {
      try {
        const connections = await openBankingApi.connections();
        if (
          !active ||
          !connections.some((item) => item.status === "active" && item.accountCount > 0)
        )
          return;
        const [transactionResult, nextCategories] = await Promise.all([
          openBankingApi.transactions({
            from: shiftDateKey(today, -7),
            to: shiftDateKey(today, 1),
            pageSize: 200,
          }),
          categoryApi.list(),
        ]);
        if (!active) return;
        const queue = transactionResult.data.filter((transaction) => {
          const date = transactionDate(transaction);
          return (
            transaction.direction === "debit" &&
            transaction.classification === "unreviewed" &&
            !transaction.excludedFromAnalytics &&
            !transaction.reviewedAt &&
            transaction.status !== "rejected" &&
            transaction.status !== "removed" &&
            Boolean(date) &&
            localDateKey(new Date(date!), userTimeZone) === today
          );
        });
        if (!queue.length) return;
        setCategories(nextCategories);
        setTransactions(queue);
        setSelectedCategoryId(queue[0].expense?.categoryId ?? nextCategories[0]?.id ?? "");
        setOpen(true);
      } catch {
        // O modal é um complemento ao login: uma falha aqui nunca bloqueia a aplicação.
      }
    }

    void loadReviewQueue();
    window.addEventListener(BANK_SYNC_COMPLETED_EVENT, loadReviewQueue);
    return () => {
      active = false;
      window.removeEventListener(BANK_SYNC_COMPLETED_EVENT, loadReviewQueue);
    };
  }, [userId, userTimeZone]);

  const close = useCallback(() => {
    if (!busy) setOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, open]);

  const amount = useMemo(() => {
    if (!current) return "";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: current.currency,
    }).format(current.amount);
  }, [current, locale]);

  async function saveAndContinue() {
    if (!current || !selectedCategoryId || busy) return;
    setBusy(true);
    setError("");
    try {
      await openBankingApi.reviewTransaction(current.id, {
        categoryId: selectedCategoryId,
        classification: "expense",
      });
      const remaining = transactions.slice(1);
      setTransactions(remaining);
      if (!remaining.length) {
        setOpen(false);
      } else {
        setSelectedCategoryId(remaining[0].expense?.categoryId ?? categories[0]?.id ?? "");
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function ignoreAndContinue() {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      await openBankingApi.reviewTransaction(current.id, { excludedFromAnalytics: true });
      const remaining = transactions.slice(1);
      setTransactions(remaining);
      if (!remaining.length) setOpen(false);
      else setSelectedCategoryId(remaining[0].expense?.categoryId ?? categories[0]?.id ?? "");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCurrent() {
    if (!current || deleteBusy) return;
    setDeleteBusy(true);
    setError("");
    try {
      await openBankingApi.deleteTransaction(current.id);
      const remaining = transactions.slice(1);
      setTransactions(remaining);
      setDeleteConfirmOpen(false);
      if (!remaining.length) setOpen(false);
      else setSelectedCategoryId(remaining[0].expense?.categoryId ?? categories[0]?.id ?? "");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!current) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop daily-review-backdrop"
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <motion.section
            ref={dialogRef}
            className="daily-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="daily-review-modal__header">
              <div>
                <span className="daily-review-modal__eyebrow">
                  <Landmark aria-hidden="true" /> {t("Sincronizado pelo banco")}
                </span>
                <h2 id={titleId}>{t("Classifique os gastos de hoje")}</h2>
                <p id={descriptionId}>
                  {t("Confirme uma categoria para manter os seus resumos organizados.")}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                className="icon-button daily-review-modal__close"
                type="button"
                onClick={close}
                disabled={busy}
                aria-label={t("Classificar mais tarde")}
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className="daily-review-modal__progress" aria-live="polite">
              <span>{t("Por classificar")}</span>
              <strong>{transactions.length}</strong>
            </div>

            <TiltCard className="daily-review-card">
              <div className="daily-review-card__top">
                <span className="daily-review-card__icon" aria-hidden="true">
                  <ReceiptText />
                </span>
                <span>
                  {current.bankAccountLink.connection?.institutionName ?? t("Banco ligado")} · {current.bankAccountLink.displayName}
                </span>
              </div>
              <div className="daily-review-card__body">
                <div>
                  <h3>{current.description}</h3>
                  <p>{current.counterpartyName || t("Movimento bancário")}</p>
                </div>
                <strong>{amount}</strong>
              </div>
              <div className="daily-review-card__meta" aria-label={t("Estado do movimento")}>
                <span>{t(current.status === "pending" ? "Pendente" : "Contabilizado")}</span>
                <span>{t("Movimento importado do banco")}</span>
                <span>{formatTransactionDate(current, locale, t("Sem data"))}</span>
              </div>
            </TiltCard>

            <label className="field daily-review-modal__field" htmlFor="daily-review-category">
              <span>{t("Categoria")}</span>
              <select
                id="daily-review-category"
                value={selectedCategoryId}
                disabled={busy}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
              >
                {categories.map((category, index) => (
                  <option key={category.id || `category-${index}`} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p className="daily-review-modal__error" role="alert">
                {error}
              </p>
            )}

            <div className="daily-review-modal__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={close}
                disabled={busy}
              >
                {t("Mais tarde")}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => void ignoreAndContinue()}
                disabled={busy}
              >
                <X aria-hidden="true" /> {t("Não é um gasto")}
              </button>
              <button
                className="button button--danger button--small"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={busy}
              >
                <X aria-hidden="true" /> {t("Apagar movimento")}
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => void saveAndContinue()}
                disabled={busy || !selectedCategoryId}
              >
                {busy
                  ? t("A guardar…")
                  : transactions.length > 1
                    ? t("Guardar e continuar")
                    : t("Concluir")}
                {transactions.length > 1 ? (
                  <ArrowRight aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("Apagar movimento importado?")}
        description={t(
          "Este movimento será removido das despesas e não voltará a aparecer após nova sincronização.",
        )}
        confirmLabel={t("Apagar movimento")}
        busy={deleteBusy}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void deleteCurrent()}
      />
    </AnimatePresence>
  );
}

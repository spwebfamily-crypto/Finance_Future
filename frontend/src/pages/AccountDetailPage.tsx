import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BankBalance } from "../components/BankBalance";
import { BankTransactionList } from "../components/BankTransactionList";
import { ErrorState, LoadingState } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { accountApi, categoryApi, openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type {
  BankTransaction,
  BankTransactionClassification,
  BankTransactionStatus,
  FinancialAccount,
} from "../types";
import { useI18n } from "../i18n/I18nContext";

const statusOptions: Array<
  { value: ""; label: string } | { value: BankTransactionStatus; label: string }
> = [
  { value: "", label: "Todos os estados" },
  { value: "pending", label: "Pendentes" },
  { value: "booked", label: "Contabilizados" },
];

const classificationOptions: Array<
  { value: ""; label: string } | { value: BankTransactionClassification; label: string }
> = [
  { value: "", label: "Todas as classificações" },
  { value: "unreviewed", label: "Por rever" },
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Rendimento" },
  { value: "internal_transfer", label: "Transferência própria" },
  { value: "refund", label: "Reembolso" },
  { value: "ignored", label: "Ignorado" },
];

export function AccountDetailPage() {
  const { t } = useI18n();
  const { accountId = "" } = useParams();
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [status, setStatus] = useState<"" | BankTransactionStatus>("");
  const [classification, setClassification] = useState<"" | BankTransactionClassification>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    setError("");
    try {
      const [accountsResult, categoriesResult] = await Promise.allSettled([
        accountApi.list(),
        categoryApi.list(),
      ]);
      if (accountsResult.status === "rejected") throw accountsResult.reason;
      const found = accountsResult.value.find((item) => item.id === accountId) ?? null;
      setAccount(found);
      if (categoriesResult.status === "fulfilled") {
        setCategories(
          categoriesResult.value.map((category) => ({ id: category.id, name: category.name })),
        );
      } else {
        setCategories([]);
        setError(
          t("A conta foi carregada, mas as categorias estão temporariamente indisponíveis."),
        );
      }
      setTransactions([]);
      setPageCount(1);
      if (found?.source === "bank") {
        try {
          const result = await openBankingApi.transactions({
            accountId,
            ...(status ? { status } : {}),
            ...(classification ? { classification } : {}),
            page,
            pageSize: 25,
          });
          setTransactions(result.data);
          setPageCount(result.meta.pageCount);
        } catch (requestError) {
          setError(errorMessage(requestError));
        }
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, page, status, classification, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = useMemo(() => account?.currency ?? "EUR", [account]);

  async function changeCategory(transaction: BankTransaction, categoryId: string) {
    setBusyTransactionId(transaction.id);
    try {
      await openBankingApi.reviewTransaction(transaction.id, { categoryId });
      setNotice(t("Categoria atualizada."));
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function confirmExpense(transaction: BankTransaction, categoryId: string) {
    setBusyTransactionId(transaction.id);
    try {
      await openBankingApi.reviewTransaction(transaction.id, {
        categoryId,
        classification: "expense",
      });
      setNotice(t("Gasto confirmado."));
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function toggleAnalytics(transaction: BankTransaction, excluded: boolean) {
    setBusyTransactionId(transaction.id);
    try {
      await openBankingApi.reviewTransaction(transaction.id, {
        excludedFromAnalytics: excluded,
      });
      setNotice(
        excluded
          ? t("Este movimento deixou de contar como despesa.")
          : t("Este gasto voltou às despesas."),
      );
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function deleteTransaction() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await openBankingApi.deleteTransaction(deleteTarget.id);
      setDeleteTarget(null);
      setNotice(t("Movimento apagado."));
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading && !account) {
    return (
      <div className="page">
        <LoadingState label={t("A carregar a conta")} />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="page">
        <ErrorState message={error || t("Conta não encontrada.")} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="page page--account-detail">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow={t(account.source === "bank" ? "Conta ligada ao banco" : "Conta manual")}
        title={account.name}
        description={
          account.source === "bank"
            ? t(
                "Os movimentos ficam por rever até confirmar se são gastos. Pendentes também podem entrar nas despesas.",
              )
            : t("Saldo e movimentos desta conta.")
        }
        action={
          <Link className="button button--secondary" to="/accounts">
            <ArrowLeft aria-hidden="true" /> {t("Voltar")}
          </Link>
        }
      />

      <section className="accounts-panel">
        <BankBalance
          currentBalance={account.currentBalance ?? account.openingBalance}
          availableBalance={account.source === "bank" ? account.availableBalance : null}
          derivedBalance={account.derivedBalance}
          balanceDelta={account.balanceDelta}
          balanceSource={account.balanceSource ?? "derived"}
          balanceAsOf={account.balanceAsOf ?? null}
          currency={currency}
        />
      </section>

      {error && (
        <div className="form-alert form-alert--page" role="alert">
          {error}
        </div>
      )}

      <section className="accounts-panel" aria-labelledby="movements-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("Movimentos")}</p>
            <h2 id="movements-title">{t("Histórico da conta")}</h2>
            {account.source === "bank" && (
              <p className="section-heading__note">
                {t(
                  "Confirme os débitos que são gastos. Pendentes e contabilizados ficam visíveis até decidir.",
                )}
              </p>
            )}
          </div>
        </div>

        {account.source === "bank" && (
          <div className="planning-form__split">
            <label className="field">
              <span>{t("Estado")}</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value as "" | BankTransactionStatus);
                }}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("Classificação")}</span>
              <select
                value={classification}
                onChange={(event) => {
                  setPage(1);
                  setClassification(event.target.value as "" | BankTransactionClassification);
                }}
              >
                {classificationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {account.source !== "bank" ? (
          <p className="accounts-empty">
            {t("Os movimentos de contas manuais aparecem no arquivo geral.")}{" "}
            <Link to="/expenses">{t("Ver movimentos")}</Link>
          </p>
        ) : isLoading ? (
          <LoadingState label={t("A carregar os movimentos")} />
        ) : (
          <BankTransactionList
            transactions={transactions}
            categories={categories}
            busyTransactionId={busyTransactionId}
            onCategoryChange={(transaction, categoryId) =>
              void changeCategory(transaction, categoryId)
            }
            onConfirmExpense={(transaction, categoryId) =>
              void confirmExpense(transaction, categoryId)
            }
            onDeleteTransaction={(transaction) => setDeleteTarget(transaction)}
            onToggleAnalytics={(transaction, excluded) =>
              void toggleAnalytics(transaction, excluded)
            }
          />
        )}

        {pageCount > 1 && (
          <div className="pagination">
            <button
              type="button"
              className="button button--secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t("Anterior")}
            </button>
            <span>{t("Página {page} de {count}", { page, count: pageCount })}</span>
            <button
              type="button"
              className="button button--secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              {t("Seguinte")}
            </button>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("Apagar movimento importado?")}
        description={t(
          "Este movimento será removido das despesas e não voltará a aparecer após nova sincronização.",
        )}
        confirmLabel={t("Apagar movimento")}
        busy={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteTransaction()}
      />
    </div>
  );
}

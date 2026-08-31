import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BankBalance } from "../components/BankBalance";
import { BankTransactionList } from "../components/BankTransactionList";
import { ErrorState, LoadingState } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import { PageHeader } from "../components/PageHeader";
import { accountApi, categoryApi, openBankingApi } from "../api/resources";
import { errorMessage } from "../api/client";
import type {
  BankTransaction,
  BankTransactionClassification,
  BankTransactionStatus,
  FinancialAccount,
} from "../types";

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

  const load = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    setError("");
    try {
      const [accounts, categoryList] = await Promise.all([accountApi.list(), categoryApi.list()]);
      const found = accounts.find((item) => item.id === accountId) ?? null;
      setAccount(found);
      setCategories(categoryList.map((category) => ({ id: category.id, name: category.name })));
      if (found) {
        const result = await openBankingApi.transactions({
          accountId,
          ...(status ? { status } : {}),
          ...(classification ? { classification } : {}),
          page,
          pageSize: 25,
        });
        setTransactions(result.data);
        setPageCount(result.meta.pageCount);
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, page, status, classification]);

  useEffect(() => {
    void load();
  }, [load]);

  const currency = useMemo(() => account?.currency ?? "EUR", [account]);

  async function changeCategory(transaction: BankTransaction, categoryId: string) {
    setBusyTransactionId(transaction.id);
    try {
      await openBankingApi.reviewTransaction(transaction.id, { categoryId });
      setNotice("Categoria atualizada.");
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
        classification: excluded ? "ignored" : undefined,
      });
      setNotice(excluded ? "Movimento excluído das análises." : "Movimento volta às análises.");
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyTransactionId(null);
    }
  }

  if (isLoading && !account) {
    return (
      <div className="page">
        <LoadingState label="A carregar a conta" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="page">
        <ErrorState message={error || "Conta não encontrada."} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="page page--account-detail">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow={account.source === "bank" ? "Conta ligada ao banco" : "Conta manual"}
        title={account.name}
        description="Movimentos importados e registados nesta conta."
        action={
          <a className="button button--secondary" href="/accounts">
            <ArrowLeft aria-hidden="true" /> Voltar
          </a>
        }
      />

      <section className="accounts-panel">
        <BankBalance
          currentBalance={account.currentBalance ?? account.openingBalance}
          availableBalance={account.source === "bank" ? account.availableBalance : null}
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
            <p className="eyebrow">Movimentos</p>
            <h2 id="movements-title">Histórico da conta</h2>
          </div>
        </div>

        <div className="planning-form__split">
          <label className="field">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as "" | BankTransactionStatus);
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Classificação</span>
            <select
              value={classification}
              onChange={(event) => {
                setPage(1);
                setClassification(event.target.value as "" | BankTransactionClassification);
              }}
            >
              {classificationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <LoadingState label="A carregar os movimentos" />
        ) : (
          <BankTransactionList
            transactions={transactions}
            categories={categories}
            busyTransactionId={busyTransactionId}
            onCategoryChange={(transaction, categoryId) =>
              void changeCategory(transaction, categoryId)
            }
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
              Anterior
            </button>
            <span>
              Página {page} de {pageCount}
            </span>
            <button
              type="button"
              className="button button--secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Seguinte
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

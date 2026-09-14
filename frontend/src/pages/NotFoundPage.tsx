import { ArrowRight, LayoutDashboard, Plus, ReceiptText } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useI18n } from "../i18n/I18nContext";

const shortcuts = [
  { to: "/expenses", label: "notFound.activity", Icon: ReceiptText },
  { to: "/expenses/new", label: "notFound.newExpense", Icon: Plus },
];

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  return (
    <main className="not-found">
      <p className="not-found__number" aria-hidden="true">
        404
      </p>
      <p className="eyebrow">{t("notFound.eyebrow")}</p>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.description")}</p>
      <div className="not-found__actions">
        {isAuthenticated ? (
          <>
            <Link className="button button--primary" to="/dashboard">
              <LayoutDashboard aria-hidden="true" /> {t("notFound.home")}
            </Link>
            {shortcuts.map(({ to, label, Icon }) => (
              <Link key={to} className="button button--secondary" to={to}>
                <Icon aria-hidden="true" /> {t(label)}
              </Link>
            ))}
          </>
        ) : (
          <>
            <Link className="button button--primary" to="/login">
              {t("notFound.signIn")} <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="button button--secondary" to="/register">
              {t("notFound.register")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

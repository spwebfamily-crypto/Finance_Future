import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { useI18n } from "./i18n/I18nContext";

function RouteDocumentTitle() {
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${t("Finanças pessoais com clareza")} · ExpenseSnap`;
  }, [t]);
  return null;
}

export default function App() {
  return (
    <>
      <RouteDocumentTitle />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

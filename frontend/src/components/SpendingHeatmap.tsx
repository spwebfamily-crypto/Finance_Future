import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import type { DailyTotal } from "../types";
import { EmptyState } from "./States";
import { todayInputValue } from "../utils/format";

interface SpendingHeatmapProps {
  month: string;
  byDay: DailyTotal[];
  currency: string;
}

function daysInMonth(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year!, mon!, 0).getDate();
}

// 0 = segunda-feira … 6 = domingo (semana pt-PT).
function weekdayIndex(isoDay: string) {
  const [year, mon, day] = isoDay.split("-").map(Number);
  return (new Date(year!, mon! - 1, day!).getDay() + 6) % 7;
}

const weekdayLabels = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function SpendingHeatmap({ month, byDay, currency }: SpendingHeatmapProps) {
  const { cells, peak } = useMemo(() => {
    const totals = new Map(byDay.map((entry) => [entry.day, entry.total]));
    const totalDays = daysInMonth(month);
    const list = Array.from({ length: totalDays }, (_, index) => {
      const dayNumber = index + 1;
      const iso = `${month}-${String(dayNumber).padStart(2, "0")}`;
      const amount = totals.get(iso) ?? 0;
      return { dayNumber, iso, amount };
    });
    return { cells: list, peak: Math.max(0, ...list.map((cell) => cell.amount)) };
  }, [byDay, month]);

  const leadingBlanks = cells.length ? weekdayIndex(cells[0]!.iso) : 0;
  const formatter = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long" });
  const todayIso = todayInputValue();

  // Intensidade em 4 níveis; o pico do mês define o teto de cada escala.
  function intensity(amount: number) {
    if (!amount || !peak) return 0;
    const ratio = amount / peak;
    if (ratio > 0.66) return 4;
    if (ratio > 0.4) return 3;
    if (ratio > 0.15) return 2;
    return 1;
  }

  return (
    <section className="dashboard-panel" aria-labelledby="heatmap-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ritmo diário</p>
          <h2 id="heatmap-title">Dias mais pesados</h2>
        </div>
        <p className="section-heading__note">
          <Flame size={12} aria-hidden="true" /> Quanto mais escuro, maior o gasto do dia.
        </p>
      </div>
      {byDay.length ? (
        <>
          <div
            className="heatmap"
            role="img"
            aria-label={`Mapa de intensidade de gastos por dia em ${month}`}
          >
            {weekdayLabels.map((label) => (
              <span key={label} className="heatmap__weekday" aria-hidden="true">
                {label}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} className="heatmap__cell heatmap__cell--blank" />
            ))}
            {cells.map((cell) => {
              const level = intensity(cell.amount);
              const label = cell.amount
                ? `${formatter.format(new Date(`${cell.iso}T12:00:00`))}: ${new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(cell.amount)}`
                : `${formatter.format(new Date(`${cell.iso}T12:00:00`))}: sem despesas`;
              return (
                <span
                  key={cell.iso}
                  className={[
                    "heatmap__cell",
                    `heatmap__cell--level-${level}`,
                    cell.iso === todayIso ? "heatmap__cell--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={label}
                  title={label}
                >
                  <span className="sr-only">{label}</span>
                </span>
              );
            })}
          </div>
          <p className="heatmap__legend" aria-hidden="true">
            menos
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className={`heatmap__cell heatmap__cell--level-${level}`} />
            ))}
            mais
          </p>
        </>
      ) : (
        <EmptyState
          title="Sem despesas neste mês"
          description="O mapa acende-se com o primeiro movimento do mês."
        />
      )}
      <Link className="text-button" to="/expenses">
        Ver movimentos do período
      </Link>
    </section>
  );
}

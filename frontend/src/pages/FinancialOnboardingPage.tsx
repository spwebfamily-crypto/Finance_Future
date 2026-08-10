import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  Home,
  Landmark,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { financialProfileApi } from '../api/resources';
import { Brand } from '../components/Brand';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState, LoadingState, Spinner } from '../components/States';
import type {
  FinancialExperience,
  FinancialGoal,
  FinancialHorizon,
  FinancialProfile,
  FinancialProfileInput,
  RiskTolerance,
} from '../types';

type MoneyField = 'monthlyNetIncome' | 'monthlyEssentialCosts' | 'monthlyHousingCosts' | 'monthlyDebtPayments' | 'currentSavings';

interface FormState {
  monthlyNetIncome: string;
  monthlyEssentialCosts: string;
  monthlyHousingCosts: string;
  monthlyDebtPayments: string;
  currentSavings: string;
  goal: FinancialGoal;
  horizon: FinancialHorizon;
  experience: FinancialExperience;
  riskTolerance: RiskTolerance;
}

const initialForm: FormState = {
  monthlyNetIncome: '',
  monthlyEssentialCosts: '',
  monthlyHousingCosts: '',
  monthlyDebtPayments: '',
  currentSavings: '',
  goal: 'emergency_fund',
  horizon: 'medium_term',
  experience: 'none',
  riskTolerance: 'moderate',
};

const goalOptions: Array<{ value: FinancialGoal; label: string; copy: string; icon: typeof Target }> = [
  { value: 'emergency_fund', label: 'Criar uma reserva', copy: 'Ter margem para imprevistos.', icon: ShieldCheck },
  { value: 'debt_repayment', label: 'Reduzir dívidas', copy: 'Recuperar folga mensal.', icon: Landmark },
  { value: 'home_purchase', label: 'Comprar casa', copy: 'Preparar a entrada e custos.', icon: Home },
  { value: 'education', label: 'Formação', copy: 'Investir em novas competências.', icon: GraduationCap },
  { value: 'retirement', label: 'Reforma', copy: 'Construir no longo prazo.', icon: Clock3 },
  { value: 'wealth_growth', label: 'Fazer crescer património', copy: 'Estudar investimento diversificado.', icon: TrendingUp },
  { value: 'major_purchase', label: 'Compra importante', copy: 'Planear sem perder controlo.', icon: WalletCards },
  { value: 'other', label: 'Outro objetivo', copy: 'Definir o seu próprio caminho.', icon: Sparkles },
];

const horizonOptions: Array<{ value: FinancialHorizon; label: string; copy: string }> = [
  { value: 'short_term', label: 'Até 3 anos', copy: 'Curto prazo' },
  { value: 'medium_term', label: '3 a 7 anos', copy: 'Médio prazo' },
  { value: 'long_term', label: 'Mais de 7 anos', copy: 'Longo prazo' },
];

const experienceOptions: Array<{ value: FinancialExperience; label: string; copy: string }> = [
  { value: 'none', label: 'Ainda não investi', copy: 'Quero começar pelas bases.' },
  { value: 'beginner', label: 'Estou a começar', copy: 'Já conheço alguns conceitos.' },
  { value: 'intermediate', label: 'Tenho experiência', copy: 'Já usei produtos de investimento.' },
  { value: 'advanced', label: 'Experiência avançada', copy: 'Conheço riscos, custos e diversificação.' },
];

const riskOptions: Array<{ value: RiskTolerance; label: string; copy: string }> = [
  { value: 'conservative', label: 'Conservador', copy: 'Prefiro estabilidade, mesmo com menor retorno potencial.' },
  { value: 'moderate', label: 'Moderado', copy: 'Aceito alguma oscilação por um horizonte maior.' },
  { value: 'aggressive', label: 'Agressivo', copy: 'Aceito quedas fortes e sei que posso perder capital.' },
];

export function parseMoney(value: string) {
  const raw = value.trim().replace(/\u00a0/g, ' ');
  if (!raw || !/^\d+(?:[ .,]\d+)*$/.test(raw)) return Number.NaN;

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  let decimalSeparator: ',' | '.' | null = null;
  if (commaCount && dotCount) {
    decimalSeparator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
  } else {
    const separator = commaCount ? ',' : dotCount ? '.' : null;
    const count = commaCount || dotCount;
    if (separator && count === 1) {
      const decimalLength = raw.length - raw.lastIndexOf(separator) - 1;
      if (decimalLength <= 2) decimalSeparator = separator;
      else if (decimalLength !== 3) return Number.NaN;
    }
  }

  const decimalIndex = decimalSeparator ? raw.lastIndexOf(decimalSeparator) : -1;
  const integerPart = decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw;
  const fraction = decimalIndex >= 0 ? raw.slice(decimalIndex + 1) : '';
  if (decimalSeparator && !/^\d{1,2}$/.test(fraction)) return Number.NaN;

  const groupingCharacters = [...new Set(integerPart.replace(/\d/g, '').split('').filter(Boolean))];
  if (groupingCharacters.length > 1 || groupingCharacters[0] === decimalSeparator) return Number.NaN;
  const groups = groupingCharacters.length ? integerPart.split(groupingCharacters[0]) : [integerPart];
  if (!/^\d+$/.test(groups[0])
    || (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))))) {
    return Number.NaN;
  }

  const normalized = `${groups.join('')}${fraction ? `.${fraction}` : ''}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toMoneyInput(value: number) {
  return value ? String(value).replace('.', ',') : '0';
}

function toFormState(profile: FinancialProfile): FormState {
  return {
    monthlyNetIncome: toMoneyInput(profile.monthlyNetIncome),
    monthlyEssentialCosts: toMoneyInput(profile.monthlyEssentialCosts),
    monthlyHousingCosts: toMoneyInput(profile.monthlyHousingCosts),
    monthlyDebtPayments: toMoneyInput(profile.monthlyDebtPayments),
    currentSavings: toMoneyInput(profile.currentSavings),
    goal: profile.goal,
    horizon: profile.horizon,
    experience: profile.experience,
    riskTolerance: profile.riskTolerance,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function FinancialOnboardingPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moneyInputRefs = useRef<Record<MoneyField, HTMLInputElement | null>>({
    monthlyNetIncome: null,
    monthlyEssentialCosts: null,
    monthlyHousingCosts: null,
    monthlyDebtPayments: null,
    currentSavings: null,
  });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [existingProfile, setExistingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [invalidFields, setInvalidFields] = useState<Partial<Record<MoneyField, boolean>>>({});

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError('');
    financialProfileApi.get()
      .then((profile) => {
        if (!active) return;
        if (profile) {
          setForm(toFormState(profile));
          setExistingProfile(true);
        } else {
          setForm(initialForm);
          setExistingProfile(false);
        }
      })
      .catch((requestError) => {
        if (active) setLoadError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!isLoading) headingRef.current?.focus();
  }, [isLoading, step]);

  const numbers = useMemo(() => ({
    income: parseMoney(form.monthlyNetIncome),
    essentials: parseMoney(form.monthlyEssentialCosts),
    housing: parseMoney(form.monthlyHousingCosts),
    debt: parseMoney(form.monthlyDebtPayments),
    savings: parseMoney(form.currentSavings),
  }), [form]);

  const monthlyCosts = [numbers.essentials, numbers.housing, numbers.debt]
    .reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const monthlyMargin = Number.isFinite(numbers.income) ? numbers.income - monthlyCosts : 0;

  function updateMoney(field: MoneyField, value: string) {
    if (/^[\d\s.,]*$/.test(value)) setForm((current) => ({ ...current, [field]: value }));
    setInvalidFields((current) => ({ ...current, [field]: false }));
    setError('');
  }

  function focusInvalidField(field: MoneyField) {
    window.requestAnimationFrame(() => {
      const input = moneyInputRefs.current[field];
      input?.focus();
      input?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  function validateCurrentStep() {
    if (step === 0 && (!Number.isFinite(numbers.income) || numbers.income <= 0)) {
      setInvalidFields({ monthlyNetIncome: true });
      setError('Indique o rendimento líquido mensal para continuar.');
      focusInvalidField('monthlyNetIncome');
      return false;
    }
    if (step === 1) {
      const fields: Array<[MoneyField, number]> = [
        ['monthlyHousingCosts', numbers.housing],
        ['monthlyEssentialCosts', numbers.essentials],
        ['monthlyDebtPayments', numbers.debt],
        ['currentSavings', numbers.savings],
      ];
      const invalid = fields.filter(([, value]) => !Number.isFinite(value) || value < 0).map(([field]) => field);
      if (invalid.length) {
        setInvalidFields(Object.fromEntries(invalid.map((field) => [field, true])));
        setError('Preencha todos os valores com zero ou um montante positivo.');
        focusInvalidField(invalid[0]);
        return false;
      }
    }
    setInvalidFields({});
    setError('');
    return true;
  }

  function continueToNextStep() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(3, current + 1));
  }

  async function saveProfile() {
    if (!validateCurrentStep()) return;
    const payload: FinancialProfileInput = {
      monthlyNetIncome: numbers.income,
      monthlyEssentialCosts: numbers.essentials,
      monthlyHousingCosts: numbers.housing,
      monthlyDebtPayments: numbers.debt,
      currentSavings: numbers.savings,
      goal: form.goal,
      horizon: form.horizon,
      experience: form.experience,
      riskTolerance: form.riskTolerance,
    };
    setIsSaving(true);
    try {
      await financialProfileApi.save(payload);
      navigate('/investments', { replace: true, state: { notice: 'Perfil financeiro guardado.' } });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProfile() {
    setIsDeleting(true);
    try {
      await financialProfileApi.remove();
      navigate('/investments', { replace: true, state: { notice: 'Perfil financeiro apagado.' } });
    } catch (requestError) {
      setShowDeleteConfirm(false);
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) return <main className="onboarding-page"><LoadingState label="A preparar o seu perfil" /></main>;
  if (loadError) {
    return (
      <main className="onboarding-page">
        <header className="onboarding-header">
          <Brand />
          <Link className="text-button" to="/expenses">Fazer mais tarde</Link>
        </header>
        <div className="onboarding-load-error">
          <ErrorState message={loadError} onRetry={() => setLoadAttempt((current) => current + 1)} />
          <Link className="button button--secondary" to="/expenses">Continuar sem perfil</Link>
        </div>
      </main>
    );
  }

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <main className="onboarding-page">
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Apagar o perfil financeiro?"
        description="O rendimento, os custos, a poupança, o objetivo e a tolerância ao risco serão eliminados. As despesas e categorias não são afetadas."
        confirmLabel="Apagar perfil"
        busy={isDeleting}
        onConfirm={() => void deleteProfile()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <header className="onboarding-header">
        <Brand />
        <Link className="text-button" to="/expenses">Fazer mais tarde</Link>
      </header>

      <div className="onboarding-shell">
        <div className="onboarding-progress-row">
          <span>{step + 1} de 4</span>
          <span>{existingProfile ? 'Atualizar perfil' : 'Perfil financeiro'}</span>
        </div>
        <div className="onboarding-progress" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label={`Etapa ${step + 1} de 4`}>
          <motion.span
            initial={false}
            animate={{ scaleX: (step + 1) / 4 }}
            transition={transition}
            style={{ width: '100%', originX: 0 }}
          />
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.section
            className="onboarding-step"
            key={step}
            initial={reduceMotion ? false : { opacity: 0, x: 4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -4, transition: { duration: 0.09 } }}
            transition={transition}
          >
            {step === 0 && (
              <>
                <span className="onboarding-step__icon"><Banknote aria-hidden="true" /></span>
                <p className="eyebrow">A sua base mensal</p>
                <h1 ref={headingRef} tabIndex={-1}>Quanto recebe por mês?</h1>
                <p className="onboarding-step__intro">Use o rendimento líquido habitual. Este valor serve para organizar o contexto — não para decidir automaticamente onde investir.</p>
                <label className="money-question">
                  <span>Rendimento líquido mensal</span>
                  <span className="money-question__control"><span aria-hidden="true">€</span><input ref={(node) => { moneyInputRefs.current.monthlyNetIncome = node; }} inputMode="decimal" value={form.monthlyNetIncome} onChange={(event) => updateMoney('monthlyNetIncome', event.target.value)} placeholder="1 500" aria-invalid={Boolean(invalidFields.monthlyNetIncome)} aria-describedby={`income-help${invalidFields.monthlyNetIncome ? ' onboarding-money-error' : ''}`} /></span>
                  <small id="income-help">Pode alterar este valor a qualquer momento.</small>
                </label>
              </>
            )}

            {step === 1 && (
              <>
                <span className="onboarding-step__icon"><CircleDollarSign aria-hidden="true" /></span>
                <p className="eyebrow">A sua vida financeira</p>
                <h1 ref={headingRef} tabIndex={-1}>Para onde vai o essencial?</h1>
                <p className="onboarding-step__intro">Uma estimativa honesta é suficiente. Não precisa de ser perfeita.</p>
                <div className="onboarding-money-grid">
                  <MoneyInput field="monthlyHousingCosts" label="Casa e habitação" value={form.monthlyHousingCosts} onChange={(value) => updateMoney('monthlyHousingCosts', value)} icon={Home} inputRef={(node) => { moneyInputRefs.current.monthlyHousingCosts = node; }} invalid={Boolean(invalidFields.monthlyHousingCosts)} />
                  <MoneyInput field="monthlyEssentialCosts" label="Outras despesas essenciais" value={form.monthlyEssentialCosts} onChange={(value) => updateMoney('monthlyEssentialCosts', value)} icon={WalletCards} inputRef={(node) => { moneyInputRefs.current.monthlyEssentialCosts = node; }} invalid={Boolean(invalidFields.monthlyEssentialCosts)} />
                  <MoneyInput field="monthlyDebtPayments" label="Prestações de dívidas" value={form.monthlyDebtPayments} onChange={(value) => updateMoney('monthlyDebtPayments', value)} icon={Landmark} inputRef={(node) => { moneyInputRefs.current.monthlyDebtPayments = node; }} invalid={Boolean(invalidFields.monthlyDebtPayments)} />
                  <MoneyInput field="currentSavings" label="Poupança disponível hoje" value={form.currentSavings} onChange={(value) => updateMoney('currentSavings', value)} icon={PiggyBank} inputRef={(node) => { moneyInputRefs.current.currentSavings = node; }} invalid={Boolean(invalidFields.currentSavings)} />
                </div>
                <div className={`onboarding-balance ${monthlyMargin < 0 ? 'onboarding-balance--warning' : ''}`}>
                  <span>Margem mensal declarada</span>
                  <strong>{formatCurrency(monthlyMargin)}</strong>
                  <small>Rendimento menos os custos indicados. Reveja os valores se não refletir a sua realidade.</small>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <span className="onboarding-step__icon"><Target aria-hidden="true" /></span>
                <p className="eyebrow">Direção e tempo</p>
                <h1 ref={headingRef} tabIndex={-1}>O que quer priorizar?</h1>
                <p className="onboarding-step__intro">O horizonte e o objetivo ajudam a contextualizar a próxima leitura educativa.</p>
                <div className="choice-grid choice-grid--goals">
                  {goalOptions.map(({ value, label, copy, icon: Icon }) => (
                    <ChoiceButton key={value} selected={form.goal === value} label={label} copy={copy} icon={Icon} onClick={() => setForm((current) => ({ ...current, goal: value }))} />
                  ))}
                </div>
                <fieldset className="choice-fieldset">
                  <legend>Prazo principal</legend>
                  <div className="choice-grid choice-grid--three">
                    {horizonOptions.map((option) => <ChoiceButton key={option.value} selected={form.horizon === option.value} label={option.label} copy={option.copy} onClick={() => setForm((current) => ({ ...current, horizon: option.value }))} />)}
                  </div>
                </fieldset>
              </>
            )}

            {step === 3 && (
              <>
                <span className="onboarding-step__icon"><Scale aria-hidden="true" /></span>
                <p className="eyebrow">Experiência e risco</p>
                <h1 ref={headingRef} tabIndex={-1}>Como reage à incerteza?</h1>
                <p className="onboarding-step__intro">Não há uma resposta certa. Investimentos podem perder valor; este perfil apenas adapta a explicação e nunca executa compras.</p>
                <fieldset className="choice-fieldset">
                  <legend>Experiência</legend>
                  <div className="choice-grid choice-grid--two">
                    {experienceOptions.map((option) => <ChoiceButton key={option.value} selected={form.experience === option.value} label={option.label} copy={option.copy} onClick={() => setForm((current) => ({ ...current, experience: option.value }))} />)}
                  </div>
                </fieldset>
                <fieldset className="choice-fieldset">
                  <legend>Tolerância a oscilações</legend>
                  <div className="choice-grid choice-grid--three">
                    {riskOptions.map((option) => <ChoiceButton key={option.value} selected={form.riskTolerance === option.value} label={option.label} copy={option.copy} onClick={() => setForm((current) => ({ ...current, riskTolerance: option.value }))} />)}
                  </div>
                </fieldset>
                <div className="onboarding-privacy"><ShieldCheck aria-hidden="true" /><span><strong>Os seus valores ficam na sua conta.</strong> Não são partilhados com corretoras nem usados para comprar ativos.</span></div>
              </>
            )}
          </motion.section>
        </AnimatePresence>

        {error && <p className="form-alert onboarding-error" id="onboarding-money-error" role="alert">{error}</p>}

        <div className="onboarding-actions">
          <button className="button button--secondary" type="button" onClick={() => { setError(''); setInvalidFields({}); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || isSaving}><ArrowLeft aria-hidden="true" /> Voltar</button>
          {step < 3
            ? <button className="button button--primary" type="button" onClick={continueToNextStep}>Continuar <ArrowRight aria-hidden="true" /></button>
            : <button className="button button--primary" type="button" onClick={() => void saveProfile()} disabled={isSaving}>{isSaving ? <Spinner label="A guardar" /> : <><Check aria-hidden="true" /> Ver orientação educativa</>}</button>}
        </div>
        {existingProfile && (
          <button className="onboarding-delete-profile" type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isSaving || isDeleting}>
            <Trash2 aria-hidden="true" /> Apagar os dados deste perfil
          </button>
        )}
      </div>
    </main>
  );
}

function MoneyInput({ field, label, value, onChange, icon: Icon, inputRef, invalid }: { field: MoneyField; label: string; value: string; onChange: (value: string) => void; icon: typeof Home; inputRef: (node: HTMLInputElement | null) => void; invalid: boolean }) {
  return (
    <label className="onboarding-money-field">
      <span><Icon aria-hidden="true" /> {label}</span>
      <span className="onboarding-money-field__control"><span aria-hidden="true">€</span><input ref={inputRef} name={field} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0" aria-invalid={invalid} aria-describedby={invalid ? 'onboarding-money-error' : undefined} /></span>
    </label>
  );
}

function ChoiceButton({ selected, label, copy, icon: Icon, onClick }: { selected: boolean; label: string; copy: string; icon?: typeof Target; onClick: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      className={`choice-button ${selected ? 'choice-button--selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={{ duration: reduceMotion ? 0 : 0.12, ease: 'easeOut' }}
    >
      {Icon && <span className="choice-button__icon"><Icon aria-hidden="true" /></span>}
      <span><strong>{label}</strong><small>{copy}</small></span>
      <span className="choice-button__check" aria-hidden="true">{selected && <Check />}</span>
    </motion.button>
  );
}

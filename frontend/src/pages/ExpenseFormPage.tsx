import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Camera, Check, FileImage, MapPin, ReceiptText, ScanText, Tag, Upload, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { categoryApi, expenseApi } from '../api/resources';
import { PageHeader } from '../components/PageHeader';
import { AuthenticatedReceiptImage } from '../components/AuthenticatedReceiptImage';
import { ErrorState, LoadingState, Spinner } from '../components/States';
import type { Category, ExpenseInput } from '../types';
import { toDateInputValue, todayInputValue } from '../utils/format';
import { readReceiptImage, type ReceiptOcrResult } from '../utils/receiptOcr';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface FormErrors {
  description?: string;
  location?: string;
  amount?: string;
  date?: string;
  categoryId?: string;
  receipt?: string;
}

const initialForm = (): ExpenseInput => ({
  description: '',
  location: '',
  amount: '',
  date: todayInputValue(),
  categoryId: '',
  receipt: null,
});

export function ExpenseFormPage() {
  const { expenseId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(expenseId);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ExpenseInput>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pageError, setPageError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingReceipt, setExistingReceipt] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ocrState, setOcrState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMessage, setOcrMessage] = useState('');

  const previewUrl = useMemo(() => {
    if (!form.receipt) return null;
    return URL.createObjectURL(form.receipt);
  }, [form.receipt]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setPageError('');

    const request = isEditing && expenseId
      ? Promise.all([categoryApi.list(), expenseApi.get(expenseId)])
      : Promise.all([categoryApi.list(), Promise.resolve(null)]);

    request
      .then(([categoryList, expense]) => {
        if (!active) return;
        setCategories(categoryList);
        if (expense) {
          setForm({
            description: expense.description,
            location: expense.location,
            amount: String(expense.amount),
            date: toDateInputValue(expense.date),
            categoryId: expense.categoryId || expense.category?.id || '',
            receipt: null,
          });
          setExistingReceipt(expense.receiptImageUrl || null);
        }
      })
      .catch((requestError) => {
        if (active) setPageError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [expenseId, isEditing]);

  function updateField<K extends keyof ExpenseInput>(field: K, value: ExpenseInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function readReceiptDetails(file: File) {
    setOcrState('reading');
    setOcrProgress(0);
    setOcrMessage('A preparar a leitura local…');
    try {
      const result = await readReceiptImage(file, categories, (progress, status) => {
        setOcrProgress(Math.round(progress * 100));
        setOcrMessage(status === 'recognizing text' ? 'A identificar os detalhes…' : 'A preparar a leitura…');
      });
      applyReceiptResult(result);
      setOcrState('done');
      setOcrMessage('Sugestões preenchidas. Confirme os dados antes de guardar.');
    } catch {
      setOcrState('error');
      setOcrMessage('Não foi possível ler a imagem. Pode preencher os campos manualmente.');
    }
  }

  function applyReceiptResult(result: ReceiptOcrResult) {
    setForm((current) => ({
      ...current,
      description: current.description || result.description || '',
      location: current.location || result.location || '',
      amount: current.amount || result.amount || '',
      date: current.date === todayInputValue() && result.date ? result.date : current.date,
      categoryId: current.categoryId || result.categoryId || '',
    }));
  }

  function selectFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, receipt: 'Escolha uma imagem JPG, PNG ou WEBP.' }));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrors((current) => ({ ...current, receipt: 'A imagem não pode exceder 5 MB.' }));
      return;
    }
    setExistingReceipt(null);
    setForm((current) => ({ ...current, receipt: file, removeReceipt: false }));
    setErrors((current) => ({ ...current, receipt: undefined }));
    void readReceiptDetails(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function removeReceipt() {
    updateField('receipt', null);
    setForm((current) => ({ ...current, receipt: null, removeReceipt: Boolean(existingReceipt) }));
    setExistingReceipt(null);
    setOcrState('idle');
    setOcrProgress(0);
    setOcrMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function validate() {
    const nextErrors: FormErrors = {};
    if (!form.description.trim()) nextErrors.description = 'Indique uma descrição.';
    if (!form.location.trim()) nextErrors.location = 'Indique o local da despesa.';
    if (!form.amount || Number(form.amount) <= 0) nextErrors.amount = 'Introduza um valor superior a zero.';
    if (!form.date) nextErrors.date = 'Escolha uma data.';
    if (!form.categoryId) nextErrors.categoryId = 'Escolha uma categoria.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPageError('');
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      if (isEditing && expenseId) {
        await expenseApi.update(expenseId, form);
      } else {
        await expenseApi.create(form);
      }
      navigate('/expenses', {
        replace: true,
        state: { notice: isEditing ? 'Despesa atualizada.' : 'Despesa guardada.' },
      });
    } catch (requestError) {
      setPageError(errorMessage(requestError));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <div className="page"><LoadingState label={isEditing ? 'A carregar despesa' : 'A preparar formulário'} /></div>;
  if (pageError && isEditing && categories.length === 0) return <div className="page"><ErrorState message={pageError} /></div>;

  return (
    <div className="page page--form">
      <Link className="back-link" to="/expenses"><ArrowLeft aria-hidden="true" /> Voltar ao arquivo</Link>
      <PageHeader
        eyebrow={isEditing ? 'Arquivo / Editar' : 'Arquivo / Novo registo'}
        title={isEditing ? 'Editar despesa' : 'Nova despesa'}
        description={isEditing ? 'Ajuste os dados e volte a guardar.' : 'Guarde o essencial agora. O recibo é opcional.'}
      />

      {pageError && <div className="form-alert form-alert--page" role="alert">{pageError}</div>}

      <form className="expense-form" onSubmit={handleSubmit} noValidate>
        <section className="form-section form-section--details" aria-labelledby="details-title">
          <div className="form-section__number" aria-hidden="true">01</div>
          <div className="form-section__content">
            <div className="form-section__heading"><ReceiptText aria-hidden="true" /><div><h2 id="details-title">Detalhes da despesa</h2><p>Os dados que identificam este movimento.</p></div></div>
            <div className="form-grid">
              <label className="field field--span-2">
                <span>Descrição</span>
                <input type="text" name="description" value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Ex.: compras da semana" maxLength={120} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'description-error' : undefined} />
                {errors.description && <small className="field__error" id="description-error">{errors.description}</small>}
              </label>
              <label className="field">
                <span>Local</span>
                <span className="field__control"><MapPin aria-hidden="true" /><input type="text" name="location" value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Ex.: Mercado local" maxLength={120} aria-invalid={Boolean(errors.location)} aria-describedby={errors.location ? 'location-error' : undefined} /></span>
                {errors.location && <small className="field__error" id="location-error">{errors.location}</small>}
              </label>
              <label className="field">
                <span>Valor</span>
                <span className="field__control field__control--amount"><span aria-hidden="true">€</span><input type="number" name="amount" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateField('amount', event.target.value)} placeholder="0,00" aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? 'amount-error' : undefined} /></span>
                {errors.amount && <small className="field__error" id="amount-error">{errors.amount}</small>}
              </label>
              <label className="field">
                <span>Data</span>
                <span className="field__control"><CalendarDays aria-hidden="true" /><input type="date" name="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'date-error' : undefined} /></span>
                {errors.date && <small className="field__error" id="date-error">{errors.date}</small>}
              </label>
              <label className="field">
                <span>Categoria</span>
                <span className="field__control"><Tag aria-hidden="true" /><select name="categoryId" value={form.categoryId} onChange={(event) => updateField('categoryId', event.target.value)} aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId ? 'category-error' : undefined}>
                  <option value="">Escolha uma categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></span>
                {errors.categoryId && <small className="field__error" id="category-error">{errors.categoryId}</small>}
              </label>
            </div>
          </div>
        </section>

        <section className="form-section form-section--receipt" aria-labelledby="receipt-title">
          <div className="form-section__number" aria-hidden="true">02</div>
          <div className="form-section__content">
            <div className="form-section__heading"><Camera aria-hidden="true" /><div><h2 id="receipt-title">Comprovativo</h2><p>Uma imagem ajuda a manter tudo verificável.</p></div></div>
            {(previewUrl || existingReceipt) ? (
              <div className="receipt-preview">
                {previewUrl
                  ? <img src={previewUrl} alt="Pré-visualização do recibo" />
                  : existingReceipt && <AuthenticatedReceiptImage receiptUrl={existingReceipt} alt="Pré-visualização do recibo" />}
                <div className="receipt-preview__details">
                  <FileImage aria-hidden="true" />
                  <div><strong>{form.receipt?.name || 'Recibo guardado'}</strong><small>{form.receipt ? `${(form.receipt.size / 1024 / 1024).toFixed(1)} MB` : 'Imagem atual'}</small></div>
                  <button type="button" className="icon-button icon-button--danger" onClick={removeReceipt} aria-label="Remover foto do recibo"><X aria-hidden="true" /></button>
                </div>
              </div>
            ) : (
              <label
                className={`upload-zone ${isDragging ? 'upload-zone--dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" name="receipt" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleFileChange} aria-describedby="receipt-help" />
                <span className="upload-zone__icon" aria-hidden="true"><Upload /></span>
                <span className="upload-zone__title">Foto do recibo</span>
                <span className="upload-zone__copy">Toque para escolher ou arraste uma imagem</span>
                <small id="receipt-help">JPG, PNG ou WEBP · máximo 5 MB</small>
              </label>
            )}
            {form.receipt && (
              <div className={`receipt-ocr ${ocrState === 'error' ? 'receipt-ocr--error' : ''}`} role="status" aria-live="polite">
                <span className="receipt-ocr__icon" aria-hidden="true"><ScanText /></span>
                <div className="receipt-ocr__copy">
                  <strong>{ocrState === 'reading' ? 'A ler o comprovativo' : ocrState === 'done' ? 'Leitura concluída' : 'Preenchimento local'}</strong>
                  <p>{ocrMessage || 'A leitura acontece no seu dispositivo e apenas sugere valores para confirmar.'}</p>
                  {ocrState === 'reading' && <div className="receipt-ocr__progress" aria-label={`Leitura ${ocrProgress}%`}><span style={{ width: `${Math.max(4, ocrProgress)}%` }} /></div>}
                </div>
                {(ocrState === 'error' || ocrState === 'done') && <button className="button button--secondary button--small" type="button" onClick={() => void readReceiptDetails(form.receipt!)}>{ocrState === 'error' ? 'Tentar novamente' : 'Ler de novo'}</button>}
              </div>
            )}
            {errors.receipt && <p className="field__error" role="alert">{errors.receipt}</p>}
          </div>
        </section>

        <div className="form-actions">
          <Link className="button button--secondary" to="/expenses">Cancelar</Link>
          <button className="button button--primary" type="submit" disabled={isSubmitting || categories.length === 0}>
            {isSubmitting ? <Spinner label="A guardar" /> : <><Check aria-hidden="true" /> Guardar despesa</>}
          </button>
        </div>
      </form>
    </div>
  );
}

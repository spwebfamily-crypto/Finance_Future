import { useMemo, useState, type ChangeEvent } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { expenseApi } from '../api/resources';
import { errorMessage } from '../api/client';
import type { Category, ExpenseImportResult, ExpenseInput, FinancialAccount } from '../types';
import { Spinner } from './States';

type ParsedRow = {
  date: string;
  description: string;
  location: string;
  amount: string;
  categoryId: string;
};

type HeaderMap = {
  date: number;
  description: number;
  location: number;
  category: number;
  amount: number;
};

const normalizeHeader = (value: string) => value
  .trim()
  .toLocaleLowerCase('pt-PT')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delimiter = text.split('\n', 1)[0]?.includes(';') ? ';' : ',';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return '';
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const check = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(check.getTime()) ? '' : result;
}

function parseAmount(value: string) {
  let normalized = value.trim().replace(/[^\d,.-]/g, '');
  if (!normalized) return '';
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const decimal = Math.max(lastComma, lastDot);
    normalized = `${normalized.slice(0, decimal).replaceAll(/[.,]/g, '')}.${normalized.slice(decimal + 1)}`;
  } else if (lastComma > -1) {
    normalized = normalized.replaceAll('.', '').replace(',', '.');
  } else if ((normalized.match(/\./g) || []).length > 1) {
    const decimal = normalized.lastIndexOf('.');
    normalized = `${normalized.slice(0, decimal).replaceAll('.', '')}.${normalized.slice(decimal + 1)}`;
  }
  const amount = Math.abs(Number(normalized));
  return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

function buildHeaderMap(header: string[]): HeaderMap {
  const keys = header.map(normalizeHeader);
  const find = (...names: string[]) => keys.findIndex((key) => names.includes(key));
  return {
    date: find('data', 'date', 'datamovimento', 'datavalor'),
    description: find('descricao', 'description', 'movimento', 'detalhe', 'memo'),
    location: find('local', 'estabelecimento', 'merchant', 'beneficiario'),
    category: find('categoria', 'category'),
    amount: find('valor', 'amount', 'montante', 'debito', 'debit'),
  };
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() || '' : '';
}

interface CsvExpenseImportProps {
  categories: Category[];
  accounts: FinancialAccount[];
  onImported: (result: ExpenseImportResult) => void;
}

export function CsvExpenseImport({ categories, accounts, onImported }: CsvExpenseImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fallbackCategoryId, setFallbackCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [location, setLocation] = useState('Importacao CSV');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const categoryByName = useMemo(
    () => new Map(categories.map((category) => [normalizeHeader(category.name), category.id])),
    [categories],
  );

  function reset() {
    setRows([]);
    setFileName('');
    setError('');
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const table = parseCsv(String(reader.result || '').replace(/^\uFEFF/, ''));
      if (table.length < 2) {
        setRows([]);
        setError('O ficheiro precisa de uma linha de cabecalho e pelo menos um movimento.');
        return;
      }
      const map = buildHeaderMap(table[0]);
      if (map.date < 0 || map.description < 0 || map.amount < 0) {
        setRows([]);
        setError('Nao foram encontradas as colunas Data, Descricao e Valor.');
        return;
      }
      const parsed = table.slice(1).flatMap((source) => {
        const date = parseDate(valueAt(source, map.date));
        const description = valueAt(source, map.description);
        const amount = parseAmount(valueAt(source, map.amount));
        if (!date || !description || !amount) return [];
        const mappedCategory = categoryByName.get(normalizeHeader(valueAt(source, map.category))) || '';
        return [{ date, description, amount, categoryId: mappedCategory, location: valueAt(source, map.location) || location }];
      });
      if (!parsed.length) {
        setRows([]);
        setError('Nao foi possivel ler movimentos validos. Confirme o formato das datas e valores.');
        return;
      }
      setRows(parsed.slice(0, 250));
      setFileName(file.name);
      if (parsed.length > 250) setError('A importacao foi limitada aos primeiros 250 movimentos.');
    };
    reader.onerror = () => setError('Nao foi possivel ler este ficheiro.');
    reader.readAsText(file, 'UTF-8');
  }

  async function confirmImport() {
    if (!rows.length || !fallbackCategoryId) {
      setError('Escolha uma categoria de reserva antes de importar.');
      return;
    }
    setIsImporting(true);
    setError('');
    try {
      const items: ExpenseInput[] = rows.map((row) => ({
        description: row.description,
        location: row.location || location || 'Importacao CSV',
        amount: row.amount,
        date: row.date,
        categoryId: row.categoryId || fallbackCategoryId,
        accountId: accountId || null,
      }));
      const result = await expenseApi.import(items);
      onImported(result);
      reset();
      setIsOpen(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsImporting(false);
    }
  }

  if (!isOpen) return <button className="button button--secondary button--small" type="button" onClick={() => setIsOpen(true)}><Upload aria-hidden="true" /> Importar CSV</button>;

  return <section className="csv-import" aria-labelledby="csv-import-title">
    <div className="csv-import__heading"><div><p className="eyebrow">Importacao segura</p><h2 id="csv-import-title">Extrato em CSV</h2><p>O ficheiro e revisto antes do registo. Valores negativos sao tratados como despesas.</p></div><button className="icon-button" type="button" onClick={() => { reset(); setIsOpen(false); }} aria-label="Fechar importacao"><X aria-hidden="true" /></button></div>
    <div className="csv-import__controls">
      <label className="upload-zone upload-zone--compact"><FileSpreadsheet aria-hidden="true" /><span>{fileName || 'Escolher ficheiro CSV'}</span><input type="file" accept=".csv,text/csv" onChange={selectFile} /></label>
      <label className="field field--compact"><span>Categoria de reserva</span><select value={fallbackCategoryId} onChange={(event) => setFallbackCategoryId(event.target.value)}><option value="">Escolher categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="field field--compact"><span>Conta <em>opcional</em></span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Sem conta associada</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="field field--compact"><span>Local de reserva</span><input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={160} /></label>
    </div>
    {error && <p className="form-alert" role="alert">{error}</p>}
    {rows.length > 0 && <><div className="csv-import__preview"><p><strong>{rows.length}</strong> movimentos prontos para revisao</p><ol>{rows.slice(0, 5).map((row, index) => <li key={`${row.date}-${row.description}-${index}`}><time>{row.date}</time><span>{row.description}</span><b>{row.amount}</b></li>)}</ol>{rows.length > 5 && <small>e mais {rows.length - 5} movimentos.</small>}</div><button className="button button--primary" type="button" disabled={isImporting || !categories.length} onClick={() => void confirmImport()}>{isImporting ? <Spinner label="A importar" /> : <><Upload aria-hidden="true" /> Confirmar importacao</>}</button></>}
  </section>;
}

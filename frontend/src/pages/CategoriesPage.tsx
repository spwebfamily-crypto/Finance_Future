import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Edit3, FolderPlus, LockKeyhole, Plus, Tag, Trash2, X } from 'lucide-react';
import { categoryApi } from '../api/resources';
import { errorMessage } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState, Spinner } from '../components/States';
import type { Category } from '../types';

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingIcon, setEditingIcon] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setCategories(await categoryApi.list());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Dê um nome à nova categoria.');
      return;
    }
    setIsSaving(true);
    try {
      const created = await categoryApi.create(name, icon);
      setCategories((current) => [...current, created]);
      setName('');
      setIcon('');
      setNotice('Categoria criada.');
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(category: Category) {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingIcon(category.icon || '');
  }

  async function saveEdit(category: Category) {
    if (!editingName.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      const updated = await categoryApi.update(category.id, editingName, editingIcon);
      setCategories((current) => current.map((item) => item.id === category.id ? updated : item));
      setEditingId(null);
      setNotice('Categoria atualizada.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await categoryApi.remove(deleteTarget.id);
      setCategories((current) => current.filter((category) => category.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice('Categoria eliminada.');
    } catch (requestError) {
      setDeleteTarget(null);
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="page page--categories">
      {notice && <div className="toast" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso"><X aria-hidden="true" /></button></div>}
      <PageHeader
        eyebrow="Organização / Categorias"
        title="Uma pasta para cada gasto"
        description="Use as categorias base ou crie as suas próprias regras de arquivo."
      />

      <div className="categories-layout">
        <section className="category-create" aria-labelledby="new-category-title">
          <span className="category-create__shape" aria-hidden="true"><FolderPlus /></span>
          <p className="eyebrow">Personalizar</p>
          <h2 id="new-category-title">Nova categoria</h2>
          <p>Crie um nome curto e, se quiser, associe-lhe um símbolo.</p>
          <form className="stack-form" onSubmit={createCategory} noValidate>
            {formError && <div className="form-alert" role="alert">{formError}</div>}
            <label className="field"><span>Nome da categoria</span><input type="text" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Casa" maxLength={40} /></label>
            <label className="field"><span>Ícone <small>(opcional)</small></span><input className="emoji-input" type="text" name="icon" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Ex.: 🏠" maxLength={8} /></label>
            <button className="button button--primary button--wide" type="submit" disabled={isSaving}>{isSaving && !editingId ? <Spinner label="A criar" /> : <><Plus aria-hidden="true" /> Criar categoria</>}</button>
          </form>
        </section>

        <section className="category-library" aria-labelledby="category-list-title">
          <div className="section-heading"><h2 id="category-list-title">A sua biblioteca</h2>{!isLoading && !error && <p>{categories.length} categorias</p>}</div>
          {isLoading ? <LoadingState label="A carregar categorias" /> : error && categories.length === 0 ? <ErrorState message={error} onRetry={() => void loadCategories()} /> : categories.length === 0 ? <EmptyState title="Sem categorias" description="Crie uma categoria para começar a organizar as suas despesas." /> : (
            <div className="category-list">
              {error && <div className="form-alert" role="alert">{error}</div>}
              {categories.map((category, index) => {
                const isEditing = editingId === category.id;
                return (
                  <article className={`category-row ${isEditing ? 'category-row--editing' : ''}`} key={category.id}>
                    <span className="category-row__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    {isEditing ? (
                      <div className="category-row__edit-fields">
                        <label><span className="sr-only">Ícone</span><input className="emoji-input" value={editingIcon} onChange={(event) => setEditingIcon(event.target.value)} maxLength={8} aria-label={`Ícone de ${category.name}`} /></label>
                        <label><span className="sr-only">Nome</span><input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={40} aria-label={`Nome de ${category.name}`} /></label>
                      </div>
                    ) : (
                      <>
                        <span className="category-row__icon" aria-hidden="true">{category.icon || <Tag />}</span>
                        <div className="category-row__name"><h3>{category.name}</h3><p>{category.isDefault ? 'Categoria base' : 'Categoria personalizada'}</p></div>
                      </>
                    )}
                    <div className="category-row__actions">
                      {category.isDefault ? (
                        <span className="locked-label"><LockKeyhole aria-hidden="true" /> Fixa</span>
                      ) : isEditing ? (
                        <>
                          <button className="icon-button" type="button" onClick={() => setEditingId(null)} aria-label={`Cancelar edição de ${category.name}`}><X aria-hidden="true" /></button>
                          <button className="icon-button icon-button--confirm" type="button" onClick={() => void saveEdit(category)} disabled={isSaving || !editingName.trim()} aria-label={`Guardar ${category.name}`}><Check aria-hidden="true" /></button>
                        </>
                      ) : (
                        <>
                          <button className="icon-button" type="button" onClick={() => startEditing(category)} aria-label={`Editar ${category.name}`}><Edit3 aria-hidden="true" /></button>
                          <button className="icon-button icon-button--danger" type="button" onClick={() => setDeleteTarget(category)} aria-label={`Eliminar ${category.name}`}><Trash2 aria-hidden="true" /></button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar esta categoria?"
        description={deleteTarget ? `“${deleteTarget.name}” será removida. Categorias associadas a despesas não podem ser eliminadas.` : ''}
        confirmLabel="Eliminar categoria"
        busy={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

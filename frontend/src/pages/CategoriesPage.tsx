import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Edit3, FolderPlus, LockKeyhole, Plus, Trash2, X } from "lucide-react";
import { categoryApi } from "../api/resources";
import { errorMessage } from "../api/client";
import { CategoryIcon, CATEGORY_ICON_OPTIONS, categoryIconName } from "../components/CategoryIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingState, Spinner } from "../components/States";
import { NoticeToast } from "../components/NoticeToast";
import type { Category } from "../types";

function IconPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="icon-picker" role="radiogroup" aria-label={label}>
      {CATEGORY_ICON_OPTIONS.map(({ value: optionValue, label: optionLabel, icon: Icon }) => (
        <button
          key={optionValue}
          className={`icon-picker__option ${value === optionValue ? "icon-picker__option--selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={value === optionValue}
          aria-label={optionLabel}
          title={optionLabel}
          onClick={() => onChange(optionValue)}
        >
          <Icon size={17} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function CategoriesPage() {
  const reduceMotion = useReducedMotion();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("sparkles");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("sparkles");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const editingNameRef = useRef<HTMLInputElement>(null);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError("");
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
    setFormError("");
    if (!name.trim()) {
      setFormError("Dê um nome à nova categoria.");
      nameRef.current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const created = await categoryApi.create(name, icon);
      setCategories((current) => [...current, created]);
      setName("");
      setIcon("sparkles");
      setNotice("Categoria criada.");
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(category: Category) {
    setFormError("");
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingIcon(categoryIconName(category.icon, category.name));
  }

  async function saveEdit(category: Category) {
    if (!editingName.trim()) {
      setFormError("Dê um nome à categoria.");
      editingNameRef.current?.focus();
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const updated = await categoryApi.update(category.id, editingName, editingIcon);
      setCategories((current) => current.map((item) => (item.id === category.id ? updated : item)));
      setEditingId(null);
      setNotice("Categoria atualizada.");
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
      setNotice("Categoria eliminada.");
    } catch (requestError) {
      setDeleteTarget(null);
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="page page--categories">
      <NoticeToast message={notice} onClose={() => setNotice("")} />
      <PageHeader
        eyebrow="Organização"
        title="Categorias"
        description="Agrupe os gastos de forma simples e reconhecível."
      />

      <div className="categories-layout">
        <section className="category-create" aria-labelledby="new-category-title">
          <span className="category-create__shape" aria-hidden="true">
            <FolderPlus />
          </span>
          <p className="eyebrow">Personalizar</p>
          <h2 id="new-category-title">Nova categoria</h2>
          <p>
            Crie um nome curto e associe-lhe um ícone para reconhecer os seus gastos num relance.
          </p>
          <form className="stack-form" onSubmit={createCategory} noValidate>
            {formError && (
              <div className="form-alert" role="alert" id="category-name-error">
                {formError}
              </div>
            )}
            <label className="field">
              <span>Nome da categoria</span>
              <input
                ref={nameRef}
                type="text"
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFormError("");
                }}
                placeholder="Ex.: Casa"
                maxLength={40}
                aria-invalid={Boolean(formError) && !name.trim()}
                aria-describedby={formError && !name.trim() ? "category-name-error" : undefined}
              />
            </label>
            <div className="field">
              <span>Ícone da categoria</span>
              <IconPicker value={icon} onChange={setIcon} label="Escolher ícone da categoria" />
            </div>
            <button
              className="button button--primary button--wide"
              type="submit"
              disabled={isSaving}
            >
              {isSaving && !editingId ? (
                <Spinner label="A criar" />
              ) : (
                <>
                  <Plus aria-hidden="true" /> Criar categoria
                </>
              )}
            </button>
          </form>
        </section>

        <section className="category-library" aria-labelledby="category-list-title">
          <div className="section-heading">
            <h2 id="category-list-title">A sua biblioteca</h2>
            {!isLoading && !error && <p>{categories.length} categorias</p>}
          </div>
          {isLoading ? (
            <LoadingState label="A carregar categorias" />
          ) : error && categories.length === 0 ? (
            <ErrorState message={error} onRetry={() => void loadCategories()} />
          ) : categories.length === 0 ? (
            <EmptyState
              title="Sem categorias"
              description="Crie uma categoria para começar a organizar as suas despesas."
            />
          ) : (
            <div className="category-list">
              {error && (
                <div className="form-alert" role="alert">
                  {error}
                </div>
              )}
              <AnimatePresence initial={false} mode="popLayout">
                {categories.map((category, index) => {
                  const isEditing = editingId === category.id;
                  return (
                    <motion.article
                      className={`category-row ${isEditing ? "category-row--editing" : ""}`}
                      key={category.id}
                      layout="position"
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                      }
                    >
                      <span className="category-row__index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {isEditing ? (
                        <div className="category-row__edit-fields">
                          <IconPicker
                            value={editingIcon}
                            onChange={setEditingIcon}
                            label={`Ícone de ${category.name}`}
                          />
                          <label>
                            <span className="sr-only">Nome</span>
                            <input
                              ref={editingNameRef}
                              value={editingName}
                              onChange={(event) => {
                                setEditingName(event.target.value);
                                setFormError("");
                              }}
                              maxLength={40}
                              aria-label={`Nome de ${category.name}`}
                              aria-invalid={Boolean(formError) && !editingName.trim()}
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <span className="category-row__icon">
                            <CategoryIcon icon={category.icon} categoryName={category.name} />
                          </span>
                          <div className="category-row__name">
                            <h3>{category.name}</h3>
                            <p>
                              {category.isDefault ? "Categoria base" : "Categoria personalizada"}
                            </p>
                          </div>
                        </>
                      )}
                      <div className="category-row__actions">
                        {category.isDefault ? (
                          <span className="locked-label">
                            <LockKeyhole aria-hidden="true" /> Fixa
                          </span>
                        ) : isEditing ? (
                          <>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label={`Cancelar edição de ${category.name}`}
                            >
                              <X aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button icon-button--confirm"
                              type="button"
                              onClick={() => void saveEdit(category)}
                              disabled={isSaving || !editingName.trim()}
                              aria-label={`Guardar ${category.name}`}
                            >
                              <Check aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={() => startEditing(category)}
                              aria-label={`Editar ${category.name}`}
                            >
                              <Edit3 aria-hidden="true" />
                            </button>
                            <button
                              className="icon-button icon-button--danger"
                              type="button"
                              onClick={() => setDeleteTarget(category)}
                              aria-label={`Eliminar ${category.name}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar esta categoria?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” será removida. Categorias associadas a despesas não podem ser eliminadas.`
            : ""
        }
        confirmLabel="Eliminar categoria"
        busy={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

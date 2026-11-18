/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Tag, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { TaskCategory } from '../types';
import { TASK_CATEGORY_COLORS } from '../lib/taskHelpers';
import { ConfirmModal } from './ConfirmModal';
import { Spinner } from './LoadingIndicator';

interface TaskCategoryModalProps {
  isOpen: boolean;
  categories: TaskCategory[];
  onClose: () => void;
  onAddCategory: (name: string, color: string) => Promise<string>;
  onUpdateCategory: (id: string, updates: Partial<TaskCategory>) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

export const TaskCategoryModal: React.FC<TaskCategoryModalProps> = ({
  isOpen,
  categories,
  onClose,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory
}) => {
  if (!isOpen) return null;

  // New category state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TASK_CATEGORY_COLORS[0]);

  // Edit category state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(TASK_CATEGORY_COLORS[0]);

  // Delete state
  const [categoryToDelete, setCategoryToDelete] = useState<TaskCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddCategory(newName.trim(), newColor);
      setNewName('');
      setNewColor(TASK_CATEGORY_COLORS[0]);
    } catch (err) {
      console.error('Failed to create category', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (cat: TaskCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color || TASK_CATEGORY_COLORS[0]);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;

    setIsSubmitting(true);
    try {
      await onUpdateCategory(editingId, {
        name: editName.trim(),
        color: editColor
      });
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update category', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsSubmitting(true);
    try {
      await onDeleteCategory(categoryToDelete.id);
      setCategoryToDelete(null);
    } catch (err) {
      console.error('Failed to delete category', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="relative w-full max-w-md bg-surface border border-subtle rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle bg-canvas shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-main">Manage Task Categories</h3>
              <p className="text-xs text-mut">Color-coded groups for ministry tasks</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Create new category */}
          <form onSubmit={handleCreate} className="p-3.5 rounded-xl border border-subtle bg-subtle/30 space-y-3">
            <span className="text-xs font-semibold text-main uppercase tracking-wider block">
              Add New Category
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name (e.g. Outreach, Facility, Worship)"
                className="flex-1 px-3 py-2 rounded-xl border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={!newName.trim() || isSubmitting}
                className="px-3 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSubmitting && !editingId ? (
                  <>
                    <Spinner size="xs" variant="contrast" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-accent-contrast" />
                    <span>Add</span>
                  </>
                )}
              </button>
            </div>

            {/* Color Palette Selector */}
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              <span className="text-[11px] text-mut mr-1">Color:</span>
              {TASK_CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform cursor-pointer border ${
                    newColor === c ? 'scale-125 ring-2 ring-offset-2 ring-offset-surface ring-accent border-strong' : 'border-black/10 hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </form>

          {/* List of existing categories */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-sec uppercase tracking-wider block">
              Existing Categories ({categories.length})
            </span>

            {categories.length === 0 ? (
              <p className="text-xs text-mut text-center py-6 italic border border-dashed border-subtle rounded-xl">
                No custom categories yet. Add one above to organize your tasks.
              </p>
            ) : (
              <div className="space-y-2">
                {categories.map((cat) => {
                  const isEditing = editingId === cat.id;

                  if (isEditing) {
                    return (
                      <div
                        key={cat.id}
                        className="p-3 rounded-xl border border-accent/40 bg-accent-tint/10 space-y-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={!editName.trim() || isSubmitting}
                            className="p-1.5 rounded-lg bg-accent text-accent-contrast text-xs hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            title="Save changes"
                          >
                            {isSubmitting && editingId ? (
                              <Spinner size="xs" variant="contrast" />
                            ) : (
                              <Check className="w-4 h-4 text-accent-contrast" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-subtle cursor-pointer"
                            title="Cancel edit"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Edit Color Palette */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {TASK_CATEGORY_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              className={`w-4 h-4 rounded-full transition-transform cursor-pointer border ${
                                editColor === c ? 'scale-125 ring-2 ring-offset-1 ring-offset-surface ring-accent border-strong' : 'border-black/10'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={cat.id}
                      className="p-2.5 rounded-xl border border-subtle bg-surface flex items-center justify-between gap-3 hover:border-subtle/80"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: cat.color || '#0284c7' }}
                        />
                        <span className="text-xs font-semibold text-main truncate">
                          {cat.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(cat)}
                          className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                          title="Rename or recolor category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete(cat)}
                          className="p-1.5 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="Delete category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-subtle bg-canvas shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface border border-subtle text-xs font-semibold text-sec hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete Category Confirmation */}
      {categoryToDelete && (
        <ConfirmModal
          isOpen={!!categoryToDelete}
          title="Delete Category"
          message={`Are you sure you want to delete "${categoryToDelete.name}"? Tasks currently in this category will become "No category".`}
          confirmLabel="Delete Category"
          isDestructive={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setCategoryToDelete(null)}
        />
      )}
    </div>
  );
};

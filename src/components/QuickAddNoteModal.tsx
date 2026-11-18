/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StickyNote, X, Plus } from 'lucide-react';
import { Spinner } from './LoadingIndicator';

interface QuickAddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<string | void>;
}

export const QuickAddNoteModal: React.FC<QuickAddNoteModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSave(text.trim());
      setText('');
      onClose();
    } catch (err) {
      console.error('Failed to create quick note', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
      <div
        className="relative w-full max-w-md bg-surface border border-subtle rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 text-main"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center shrink-0">
              <StickyNote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-main leading-tight">Quick Note</h3>
              <p className="text-xs text-mut">Jot down a quick thought from anywhere</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-mut hover:text-main hover:bg-subtle transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a quick note..."
              rows={4}
              autoFocus
              className="w-full px-3.5 py-3 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all resize-y min-h-[110px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-accent hover:opacity-90 text-accent-contrast shadow-xs transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

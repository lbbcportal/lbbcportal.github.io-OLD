/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { StickyNote, Plus, Pin, Clock, ArrowUpRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { formatNoteDateTime } from '../lib/dateTime';
import { Spinner } from './LoadingIndicator';

interface HomeQuickNotesRowProps {
  onNavigate: (tab: string) => void;
}

export const HomeQuickNotesRow: React.FC<HomeQuickNotesRowProps> = ({ onNavigate }) => {
  const { notes, addNote } = useData();
  const [noteText, setNoteText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Up to 3 most recently created notes first (not pinned first)
  const recentNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 3);
  }, [notes]);

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = noteText.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    try {
      await addNote(trimmed);
      setNoteText('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-stretch">
      {/* LEFT COLUMN: Add a quick note */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition-all focus-within:ring-2 focus-within:ring-accent/35 focus-within:border-accent">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent-tint text-accent shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-main tracking-tight truncate">
              Add a quick note
            </h2>
          </div>
          <span className="text-[11px] text-mut hidden sm:inline shrink-0">
            Syncs to Quick Notes
          </span>
        </div>

        <form onSubmit={handleAddNote} className="flex-1 flex flex-col justify-between gap-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAddNote();
              }
            }}
            placeholder="Type a note..."
            rows={4}
            className="w-full flex-1 min-h-[104px] rounded-xl border border-subtle bg-field px-3.5 py-2.5 text-sm text-main placeholder:text-mut focus:outline-none focus:border-accent resize-y transition-colors"
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-mut hidden sm:inline">
              Ctrl+Enter to save
            </span>
            <button
              type="submit"
              disabled={!noteText.trim() || isAdding}
              className="ml-auto px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isAdding ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add Note</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT COLUMN: Recent notes */}
      <div className="bg-surface rounded-2xl border border-subtle shadow-card p-4 sm:p-5 flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent-tint text-accent shrink-0">
              <StickyNote className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-main tracking-tight truncate">
              Recent notes
            </h2>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('quick-notes')}
            className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>View all notes</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentNotes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center rounded-xl bg-subtle/50 border border-subtle text-xs text-mut min-h-[140px]">
            No notes yet.
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2.5">
            {recentNotes.map((note) => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => onNavigate('quick-notes')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate('quick-notes');
                  }
                }}
                className="p-3 rounded-xl border border-subtle bg-subtle/40 hover:bg-surface-hover hover:border-accent/40 transition-all cursor-pointer flex flex-col justify-between gap-2 motion-card text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs sm:text-sm text-main whitespace-pre-wrap break-words leading-relaxed line-clamp-3 flex-1 min-w-0">
                    {note.text}
                  </p>
                  {note.pinned && (
                    <span
                      className="text-accent shrink-0 mt-0.5"
                      title="Pinned note"
                      aria-label="Pinned note"
                    >
                      <Pin className="w-3.5 h-3.5 fill-current rotate-45" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-mut">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>{formatNoteDateTime(note.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

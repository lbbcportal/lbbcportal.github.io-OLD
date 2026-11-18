/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  StickyNote,
  Plus,
  Search,
  X,
  Pin,
  Edit2,
  CheckSquare,
  Trash2,
  Clock,
  Sparkles
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { QuickNote } from '../types';
import { formatNoteDateTime } from '../lib/dateTime';
import { ConfirmModal } from '../components/ConfirmModal';
import { EditNoteModal } from '../components/EditNoteModal';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

interface QuickNotesPageProps {
  onNavigate?: (tab: string) => void;
}

export const QuickNotesPage: React.FC<QuickNotesPageProps> = () => {
  const { notes, addNote, updateNote, deleteNote, togglePinNote, addTask, dataLoading } = useData();

  // Top composer state
  const [newNoteText, setNewNoteText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [noteToEdit, setNoteToEdit] = useState<QuickNote | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<QuickNote | null>(null);

  // Make Task state
  const [noteForTask, setNoteForTask] = useState<QuickNote | null>(null);
  const [taskDraft, setTaskDraft] = useState<{ title: string; details?: string } | null>(null);
  const [noteToDeleteAfterTask, setNoteToDeleteAfterTask] = useState<QuickNote | null>(null);

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      if (!q) return true;
      return n.text.toLowerCase().includes(q);
    });
  }, [notes, searchQuery]);

  // Sort notes: pinned first, then newest createdAt first
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [filteredNotes]);

  // Handle adding a new note from the top box
  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteText.trim() || isAdding) return;

    setIsAdding(true);
    try {
      await addNote(newNoteText.trim());
      setNewNoteText('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setIsAdding(false);
    }
  };

  // Prepare Make Task from a note
  const handleInitiateMakeTask = (note: QuickNote) => {
    const lines = note.text.trim().split('\n');
    const firstLine = lines[0].trim();
    let title = firstLine;
    if (title.length > 80) {
      title = title.substring(0, 80).trim() + '...';
    }

    const hasMore = lines.length > 1 || note.text.trim().length > 80;
    const details = hasMore ? note.text.trim() : undefined;

    setNoteForTask(note);
    setTaskDraft({ title, details });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 motion-page-enter">
      {/* Page Title & Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-tint text-accent flex items-center justify-center shadow-2xs">
              <StickyNote className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main">
              Quick Notes
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-sec mt-1">
            Capture thoughts, prayer requests, reminder ideas, and convert them to ministry tasks anytime.
          </p>
        </div>

        {notes.length > 0 && (
          <div className="text-xs font-semibold text-mut bg-subtle px-3 py-1.5 rounded-xl border border-subtle self-start sm:self-auto">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} stored
          </div>
        )}
      </div>

      {/* Top Large Note Box */}
      <div className="rounded-2xl border border-subtle bg-surface shadow-card p-4 sm:p-5 transition-all focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent">
        <form onSubmit={handleAddNote} className="space-y-3">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              // Submit on Ctrl+Enter or Cmd+Enter
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAddNote();
              }
            }}
            placeholder="Type a note... (Press Ctrl+Enter or click Add Note to save)"
            rows={3}
            className="w-full bg-transparent border-none text-main text-sm sm:text-base placeholder:text-mut focus:outline-none resize-y min-h-[75px]"
          />

          <div className="flex items-center justify-between pt-2 border-t border-subtle/60 gap-3">
            <span className="text-[11px] text-mut hidden sm:inline">
              Notes stay synced securely to your church workspace.
            </span>
            <button
              type="submit"
              disabled={!newNoteText.trim() || isAdding}
              className="ml-auto px-4 py-2 rounded-xl bg-accent hover:opacity-95 text-accent-contrast text-xs sm:text-sm font-semibold transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40"
            >
              {isAdding ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-accent-contrast stroke-[2.5]" />
                  <span>Add Note</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {dataLoading.notes ? (
        <PageLoading />
      ) : (
        <>

      {/* Search Filter Bar */}
      {notes.length > 0 && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-mut absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-subtle bg-field text-main text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mut hover:text-main p-0.5 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Notes Grid or Empty States */}
      {notes.length === 0 ? (
        <div className="p-10 sm:p-14 text-center rounded-2xl border-2 border-dashed border-subtle bg-surface/50 max-w-md mx-auto my-6 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto shadow-2xs">
            <StickyNote className="w-7 h-7 text-accent" />
          </div>
          <h3 className="text-base font-bold text-main">
            No notes yet. Type one above.
          </h3>
          <p className="text-xs text-mut max-w-xs mx-auto">
            Use the text box above to quickly capture notes anytime.
          </p>
        </div>
      ) : (
        <div className="motion-list-enter">
          {sortedNotes.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-subtle bg-surface/50 max-w-sm mx-auto my-6 space-y-2">
              <p className="text-sm font-semibold text-main">No notes match your search</p>
              <p className="text-xs text-mut">Try searching for different keywords or clear the search filter.</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-accent font-semibold hover:underline mt-1 cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedNotes.map((note) => {
                const isPinned = note.pinned;
                return (
                  <div
                    key={note.id}
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3 motion-card ${
                      isPinned
                        ? 'bg-surface border-accent/40 shadow-card ring-1 ring-accent/25'
                        : 'bg-surface border-subtle hover:border-accent/30 shadow-card hover:shadow-md'
                    }`}
                  >
                {/* Top: Pinned Indicator & Actions */}
                <div className="flex items-start justify-between gap-2">
                  {isPinned ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-tint text-accent border border-accent/30">
                      <Pin className="w-3 h-3 fill-current rotate-45" />
                      <span>Pinned</span>
                    </span>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={() => togglePinNote(note.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isPinned
                          ? 'text-accent bg-accent-tint hover:bg-accent-tint/80'
                          : 'text-mut hover:text-main hover:bg-subtle'
                      }`}
                      title={isPinned ? 'Unpin note' : 'Pin note to top'}
                      aria-label={isPinned ? 'Unpin note' : 'Pin note to top'}
                    >
                      <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current rotate-45' : ''}`} />
                    </button>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => setNoteToEdit(note)}
                      className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                      title="Edit note"
                      aria-label="Edit note"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Make Task button */}
                    <button
                      type="button"
                      onClick={() => handleInitiateMakeTask(note)}
                      className="p-1.5 rounded-lg text-sec hover:text-accent hover:bg-subtle transition-colors cursor-pointer"
                      title="Convert to Task"
                      aria-label="Convert note to task"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => setNoteToDelete(note)}
                      className="p-1.5 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title="Delete note"
                      aria-label="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Note Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-main whitespace-pre-wrap break-words leading-relaxed">
                    {note.text}
                  </p>
                </div>

                {/* Footer: Date and Time */}
                <div className="pt-2 border-t border-subtle/60 flex items-center justify-between text-[11px] text-mut">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-mut" />
                    <span>{formatNoteDateTime(note.createdAt)}</span>
                  </span>
                  {note.updatedAt && note.updatedAt !== note.createdAt && (
                    <span className="italic opacity-80">Edited</span>
                  )}
                </div>
              </div>
            );
          })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* Edit Note Modal */}
      {noteToEdit && (
        <EditNoteModal
          isOpen={!!noteToEdit}
          note={noteToEdit}
          onClose={() => setNoteToEdit(null)}
          onSave={async (id, newText) => {
            await updateNote(id, { text: newText });
          }}
        />
      )}

      {/* Delete Note Confirmation Modal */}
      {noteToDelete && (
        <ConfirmModal
          isOpen={!!noteToDelete}
          title="Delete this note?"
          message="Are you sure you want to delete this note? This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={async () => {
            if (noteToDelete) {
              await deleteNote(noteToDelete.id);
              setNoteToDelete(null);
            }
          }}
          onCancel={() => setNoteToDelete(null)}
        />
      )}

      {/* Make Task Popup (TaskEditorModal) */}
      {noteForTask && taskDraft && (
        <TaskEditorModal
          isOpen={!!noteForTask}
          prefilledTitle={taskDraft.title}
          prefilledDetails={taskDraft.details}
          onClose={() => {
            setNoteForTask(null);
            setTaskDraft(null);
          }}
          onSave={async (taskData, customId) => {
            await addTask(taskData, customId);
            const savedNote = noteForTask;
            setNoteForTask(null);
            setTaskDraft(null);
            // Prompt: "Delete the note too?"
            setNoteToDeleteAfterTask(savedNote);
          }}
        />
      )}

      {/* Prompt After Task Creation: "Delete the note too?" */}
      {noteToDeleteAfterTask && (
        <ConfirmModal
          isOpen={!!noteToDeleteAfterTask}
          title="Delete the note too?"
          message="Your task has been created. Would you like to delete the original note or keep it?"
          confirmLabel="Yes, delete note"
          cancelLabel="No, keep note"
          isDestructive={false}
          onConfirm={async () => {
            if (noteToDeleteAfterTask) {
              await deleteNote(noteToDeleteAfterTask.id);
              setNoteToDeleteAfterTask(null);
            }
          }}
          onCancel={() => setNoteToDeleteAfterTask(null)}
        />
      )}
    </div>
  );
};

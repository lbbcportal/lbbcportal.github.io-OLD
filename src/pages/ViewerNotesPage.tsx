import React, { useMemo, useState } from 'react';
import { Check, Inbox, RotateCcw, Trash2, User } from 'lucide-react';
import { useData } from '../context/DataContext';
import { ViewerNote, ViewerNoteStatus } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoading, Spinner } from '../components/LoadingIndicator';

export const ViewerNotesPage: React.FC = () => {
  const {
    viewerNotes,
    updateViewerNoteStatus,
    deleteViewerNote,
    settings,
    dataLoading
  } = useData();

  const [filter, setFilter] = useState<ViewerNoteStatus>('new');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ViewerNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const newCount = useMemo(
    () => viewerNotes.filter(n => n.status !== 'done').length,
    [viewerNotes]
  );
  const doneCount = useMemo(
    () => viewerNotes.filter(n => n.status === 'done').length,
    [viewerNotes]
  );

  const filteredNotes = useMemo(() => {
    const list = viewerNotes.filter(n =>
      filter === 'done' ? n.status === 'done' : n.status !== 'done'
    );
    return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [viewerNotes, filter]);

  const formatTimestamp = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: settings.timeFormat !== '24h'
    });
  };

  const handleToggleStatus = async (note: ViewerNote) => {
    const nextStatus: ViewerNoteStatus = note.status === 'done' ? 'new' : 'done';
    setUpdatingId(note.id);
    try {
      await updateViewerNoteStatus(note.id, nextStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteViewerNote(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (dataLoading.viewerNotes) {
    return <PageLoading label="Loading viewer notes..." />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 motion-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-tint text-accent shrink-0">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-main tracking-tight">Viewer Notes</h1>
            <p className="text-xs text-sec mt-0.5">
              Messages and prayer requests sent from Church Viewer mode
            </p>
          </div>
        </div>

        {/* New / Done Filter Tabs */}
        <div className="inline-flex p-1 rounded-xl bg-subtle border border-subtle self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('new')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              filter === 'new'
                ? 'bg-accent text-accent-contrast shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <span>New</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
              filter === 'new'
                ? 'bg-accent-chip'
                : 'bg-surface text-main border border-subtle'
            }`}>
              {newCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('done')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
              filter === 'done'
                ? 'bg-accent text-accent-contrast shadow-xs'
                : 'text-sec hover:text-main'
            }`}
          >
            <span>Done</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
              filter === 'done'
                ? 'bg-accent-chip'
                : 'bg-surface text-main border border-subtle'
            }`}>
              {doneCount}
            </span>
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="motion-list-enter">
      {filteredNotes.length === 0 ? (
        <div className="rounded-2xl border border-subtle bg-surface p-10 text-center space-y-2 shadow-xs">
          <Inbox className="w-9 h-9 text-mut mx-auto" />
          <h2 className="text-sm font-bold text-main">
            {filter === 'new' ? 'No new viewer notes' : 'No completed viewer notes'}
          </h2>
          <p className="text-xs text-sec max-w-sm mx-auto">
            {filter === 'new'
              ? 'When church members send a note using "Note to the Secretary", it will appear here.'
              : 'Notes you mark as done will show up in this tab.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const isBusy = updatingId === note.id;
            const isDone = note.status === 'done';

            return (
              <div
                key={note.id}
                className="rounded-2xl border border-subtle bg-surface p-4 sm:p-5 shadow-card space-y-3 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-accent-tint text-accent flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-main truncate">
                      {note.name?.trim() || 'Anonymous viewer'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}>
                      {isDone ? 'Done' : 'New'}
                    </span>
                  </div>

                  <span className="text-[11px] text-mut tabular-nums">
                    {formatTimestamp(note.createdAt)}
                  </span>
                </div>

                <p className="text-sm text-main whitespace-pre-wrap break-words leading-relaxed bg-canvas/60 border border-subtle rounded-xl p-3.5">
                  {note.message}
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleStatus(note)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      isDone
                        ? 'border border-subtle bg-surface hover:bg-surface-hover text-sec'
                        : 'bg-accent hover:bg-accent-hover text-accent-contrast shadow-xs'
                    }`}
                  >
                    {isBusy ? (
                      <Spinner size="xs" variant={isDone ? 'accent' : 'contrast'} />
                    ) : isDone ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isDone ? 'Reopen' : 'Mark as done'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setDeleteTarget(note)}
                    className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-surface hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete viewer note"
        message={
          deleteTarget
            ? `Are you sure you want to delete this note${deleteTarget.name ? ` from ${deleteTarget.name}` : ''}? This action cannot be undone.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
};

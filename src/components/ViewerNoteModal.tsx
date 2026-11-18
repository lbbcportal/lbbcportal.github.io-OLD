import React, { useEffect, useState } from 'react';
import { X, Send, CheckCircle2, AlertCircle, Clock, MessageSquarePlus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Spinner } from './LoadingIndicator';

const LAST_SENT_STORAGE_KEY = 'lbbc_viewer_note_last_sent_at';
const COOLDOWN_MS = 60_000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 100;

function getRemainingCooldownSeconds(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(LAST_SENT_STORAGE_KEY);
    if (!raw) return 0;
    const lastSent = Number(raw);
    if (!Number.isFinite(lastSent)) return 0;
    const elapsed = Date.now() - lastSent;
    if (elapsed >= COOLDOWN_MS) return 0;
    return Math.ceil((COOLDOWN_MS - elapsed) / 1000);
  } catch {
    return 0;
  }
}

function recordLastSentTimestamp(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SENT_STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

interface ViewerNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ViewerNoteModal: React.FC<ViewerNoteModalProps> = ({ isOpen, onClose }) => {
  const { submitViewerNote } = useData();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 350);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSentSuccess(false);
    setCooldownSeconds(getRemainingCooldownSeconds());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      const remaining = getRemainingCooldownSeconds();
      setCooldownSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, cooldownSeconds]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, sending, onClose]);

  if (!mounted) return null;

  const trimmedMessage = message.trim();
  const remainingChars = MAX_MESSAGE_LENGTH - message.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const remaining = getRemainingCooldownSeconds();
    if (remaining > 0) {
      setCooldownSeconds(remaining);
      setError(`Please wait ${remaining} second${remaining === 1 ? '' : 's'} before sending another note.`);
      return;
    }

    if (!trimmedMessage) {
      setError('Please write a message before sending.');
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
      return;
    }

    setSending(true);
    try {
      await submitViewerNote(message, name);
      recordLastSentTimestamp();
      setCooldownSeconds(60);
      setSentSuccess(true);
      setMessage('');
      setName('');
    } catch (err: any) {
      setError(err?.message || 'Could not send your note right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs ${
        isOpen ? 'motion-backdrop-in' : 'viewer-note-backdrop-out pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onClose();
      }}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-surface border border-subtle shadow-xl text-main overflow-hidden ${
          isOpen ? 'motion-popup-in' : 'viewer-note-dialog-out'
        }`}
        role="dialog"
        aria-modal="true"
        data-controlled-dialog="true"
        aria-labelledby="viewer-note-modal-title"
      >
        <div className="px-5 py-4 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center shrink-0">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="viewer-note-modal-title" className="text-base font-bold text-main truncate">
                Send a Note
              </h2>
              <p className="text-[11px] text-mut">
                Send a short question, update, or prayer request
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="p-6 text-center space-y-4 viewer-note-sent">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-main">Sent. Thank you.</p>
              <p className="text-xs text-sec">
                Your note has been delivered to the church secretary.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {cooldownSeconds > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Please wait <strong>{cooldownSeconds}s</strong> before sending another note from this device.
                </span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="viewer-note-name" className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                Your Name <span className="text-mut font-normal normal-case">(optional)</span>
              </label>
              <input
                id="viewer-note-name"
                type="text"
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={sending}
                placeholder="e.g. Bro. Juan"
                className="w-full px-3.5 py-2 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent disabled:opacity-60"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="viewer-note-message" className="block text-xs font-semibold text-main uppercase tracking-wider">
                  Message <span className="text-red-500">*</span>
                </label>
                <span className={`text-[11px] tabular-nums font-medium ${remainingChars < 40 ? 'text-amber-600 dark:text-amber-400' : 'text-mut'}`}>
                  {message.length} / {MAX_MESSAGE_LENGTH}
                </span>
              </div>
              <textarea
                id="viewer-note-message"
                rows={4}
                maxLength={MAX_MESSAGE_LENGTH}
                required
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
                  if (error) setError(null);
                }}
                disabled={sending}
                placeholder="Write your note to the church secretary..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-y min-h-[104px] disabled:opacity-60"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={sending}
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || cooldownSeconds > 0 || !trimmedMessage}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Spinner size="xs" variant="contrast" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

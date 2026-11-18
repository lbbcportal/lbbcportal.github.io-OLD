import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  Send,
  AlertCircle,
  ExternalLink,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Trash2,
  Edit3,
  UserX,
  MessageSquare
} from 'lucide-react';
import {
  MessageTemplate,
  TemplateRoleLine,
  RoleAssignment
} from '../types';
import { useData } from '../context/DataContext';
import {
  getUpcomingOccurrences,
  buildMessageContent,
  OccurrenceItem
} from '../lib/templateHelpers';
import { toDateString } from '../lib/dateTime';
import { Spinner } from './LoadingIndicator';

interface WriteMessageModalProps {
  template: MessageTemplate;
  isOpen: boolean;
  onClose: () => void;
  preselectedOccurrenceDate?: string;
  preselectedTargetId?: string;
  onMarkAsSent?: (templateId: string, occurrenceDate: string, targetId: string) => Promise<void>;
}

export const WriteMessageModal: React.FC<WriteMessageModalProps> = ({
  template,
  isOpen,
  onClose,
  preselectedOccurrenceDate,
  preselectedTargetId,
  onMarkAsSent
}) => {
  if (!isOpen) return null;

  const {
    regularServices,
    overrides,
    events,
    assignments,
    settings,
    markReminderSent
  } = useData();

  // Upcoming occurrences (next 45 days)
  const occurrences = useMemo(() => {
    return getUpcomingOccurrences(
      regularServices,
      overrides,
      events,
      toDateString(new Date()),
      45
    );
  }, [regularServices, overrides, events]);

  // Determine initial selected occurrence
  const initialOccurrence = useMemo<OccurrenceItem | null>(() => {
    if (occurrences.length === 0) return null;

    if (preselectedOccurrenceDate && preselectedTargetId) {
      const match = occurrences.find(
        o => o.date === preselectedOccurrenceDate && o.sourceId === preselectedTargetId
      );
      if (match) return match;
    }

    if (template.linkedServiceId) {
      const linkedMatch = occurrences.find(
        o => o.type === 'regular_service' && o.sourceId === template.linkedServiceId
      );
      if (linkedMatch) return linkedMatch;
    }

    return occurrences[0];
  }, [occurrences, preselectedOccurrenceDate, preselectedTargetId, template.linkedServiceId]);

  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>(
    initialOccurrence ? initialOccurrence.id : ''
  );

  const currentOccurrence = useMemo(() => {
    return occurrences.find(o => o.id === selectedOccurrenceId) || initialOccurrence;
  }, [occurrences, selectedOccurrenceId, initialOccurrence]);

  // Custom typed values for lines
  const [typedRoleValues, setTypedRoleValues] = useState<Record<string, string>>({});
  // Set of line IDs removed by user
  const [removedLineIds, setRemovedLineIds] = useState<Set<string>>(new Set());
  // Set of unassigned lines where user chose to type a name
  const [customTypedOverrides, setCustomTypedOverrides] = useState<Set<string>>(new Set());

  // Final editable text
  const [messageText, setMessageText] = useState<string>('');
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);

  // Status indicators
  const [copied, setCopied] = useState(false);
  const [markedSent, setMarkedSent] = useState(false);
  const [savingMarkSent, setSavingMarkSent] = useState(false);

  // Resolve role line values from schedule assignments for current occurrence
  const resolvedRoleData = useMemo(() => {
    if (!currentOccurrence) {
      return { values: {}, unassignedLineIds: new Set<string>() };
    }

    const values: Record<string, string> = {};
    const unassignedLineIds = new Set<string>();

    for (const line of template.roleLines) {
      if (line.source === 'linked_role' && line.roleId) {
        // Find saved assignments for this role on this target and date
        const matching = assignments.filter(
          a =>
            a.targetId === currentOccurrence.sourceId &&
            a.date === currentOccurrence.date &&
            a.roleId === line.roleId
        );

        const assignedNames = matching
          .map(a => a.personName.trim())
          .filter(Boolean);

        if (assignedNames.length > 0) {
          values[line.id] = assignedNames.join(', ');
        } else if (typedRoleValues[line.id]) {
          values[line.id] = typedRoleValues[line.id];
        } else {
          unassignedLineIds.add(line.id);
          values[line.id] = '';
        }
      } else {
        // source === 'type_each_time'
        values[line.id] = typedRoleValues[line.id] || '';
      }
    }

    return { values, unassignedLineIds };
  }, [currentOccurrence, template.roleLines, assignments, typedRoleValues]);

  // Re-generate auto-filled message whenever occurrence or inputs change (unless manually edited)
  useEffect(() => {
    if (!currentOccurrence) return;

    // Merge automatic values with user-typed inputs
    const mergedValues: Record<string, string> = {
      ...resolvedRoleData.values,
      ...typedRoleValues
    };

    const generated = buildMessageContent(
      template.headerText,
      template.roleLines,
      template.closingText,
      currentOccurrence,
      mergedValues,
      removedLineIds
    );

    if (!isManuallyEdited) {
      setMessageText(generated);
    }
  }, [
    currentOccurrence,
    template,
    resolvedRoleData.values,
    typedRoleValues,
    removedLineIds,
    isManuallyEdited
  ]);

  // When occurrence changes, reset manual edits so template recomputes for the new date
  const handleOccurrenceChange = (newId: string) => {
    setSelectedOccurrenceId(newId);
    setIsManuallyEdited(false);
    setRemovedLineIds(new Set());
    setCustomTypedOverrides(new Set());
  };

  // Actions for unassigned lines
  const handleTypeForUnassigned = (lineId: string) => {
    setCustomTypedOverrides(prev => new Set([...prev, lineId]));
  };

  const handleRemoveLine = (lineId: string) => {
    setRemovedLineIds(prev => new Set([...prev, lineId]));
    setIsManuallyEdited(false);
  };

  const handleRestoreLine = (lineId: string) => {
    setRemovedLineIds(prev => {
      const next = new Set(prev);
      next.delete(lineId);
      return next;
    });
    setIsManuallyEdited(false);
  };

  const handleTypedValueChange = (lineId: string, val: string) => {
    setTypedRoleValues(prev => ({ ...prev, [lineId]: val }));
    setIsManuallyEdited(false);
  };

  // 1. Copy message
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  // 2. Copy and open Messenger
  const handleCopyAndOpenMessenger = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);

      const targetUrl = settings.messengerChatLink?.trim() || 'https://www.messenger.com';
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to copy and open messenger', err);
    }
  };

  // 3. Mark as sent
  const handleMarkAsSent = async () => {
    if (!currentOccurrence) return;
    setSavingMarkSent(true);
    try {
      if (onMarkAsSent) {
        await onMarkAsSent(template.id, currentOccurrence.date, currentOccurrence.sourceId);
      } else {
        await markReminderSent(template.id, currentOccurrence.date, currentOccurrence.sourceId);
      }
      setMarkedSent(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Failed to mark reminder sent', err);
    } finally {
      setSavingMarkSent(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto motion-backdrop-in">
      <div className="relative w-full max-w-3xl bg-surface border border-subtle rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden motion-popup-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle bg-canvas">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-main">
                Write Message: {template.name}
              </h2>
              <p className="text-xs text-mut">
                Review auto-filled details, copy, or launch Messenger
              </p>
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Occurrence Selector */}
          <div className="p-4 rounded-xl border border-subtle bg-subtle/30 space-y-2">
            <label className="block text-xs font-semibold text-main uppercase tracking-wider">
              Choose Service Occurrence
            </label>
            <div className="relative">
              <select
                value={currentOccurrence?.id || ''}
                onChange={(e) => handleOccurrenceChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent cursor-pointer"
              >
                {occurrences.map((occ) => (
                  <option key={occ.id} value={occ.id}>
                    {occ.dayName}, {occ.date} — {occ.title} ({occ.formattedTime})
                  </option>
                ))}
              </select>
            </div>

            {currentOccurrence && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-mut">
                <span className="flex items-center gap-1 font-medium text-sec">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  {currentOccurrence.dayName}, {currentOccurrence.formattedDate}
                </span>
                <span className="flex items-center gap-1 font-medium text-sec">
                  <Clock className="w-3.5 h-3.5 text-accent" />
                  {currentOccurrence.formattedTime}
                </span>
                {currentOccurrence.location && (
                  <span className="flex items-center gap-1 text-mut">
                    <MapPin className="w-3.5 h-3.5 text-accent" />
                    {currentOccurrence.location}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Role Lines Inputs & Warnings */}
          {template.roleLines.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-main uppercase tracking-wider">
                Role Assignments for this Occurrence
              </h3>

              <div className="space-y-2.5">
                {template.roleLines.map((line) => {
                  const isRemoved = removedLineIds.has(line.id);
                  const isUnassigned = resolvedRoleData.unassignedLineIds.has(line.id);
                  const allowsTyping = line.source === 'type_each_time' || customTypedOverrides.has(line.id);
                  const currentValue = typedRoleValues[line.id] ?? resolvedRoleData.values[line.id] ?? '';

                  if (isRemoved) {
                    return (
                      <div
                        key={line.id}
                        className="px-3 py-2 rounded-xl border border-dashed border-subtle bg-subtle/20 flex items-center justify-between text-xs text-mut"
                      >
                        <span className="line-through">{line.label} (Removed from message)</span>
                        <button
                          type="button"
                          onClick={() => handleRestoreLine(line.id)}
                          className="text-xs text-accent hover:underline font-medium cursor-pointer"
                        >
                          Restore
                        </button>
                      </div>
                    );
                  }

                  if (isUnassigned && !allowsTyping) {
                    return (
                      <div
                        key={line.id}
                        className="p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in duration-100"
                      >
                        <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>
                            <strong>{line.label}:</strong> not assigned yet for this date.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTypeForUnassigned(line.id)}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-subtle hover:bg-subtle text-xs text-main font-medium shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-accent" />
                            <span>Type a name</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="px-2.5 py-1 rounded-lg bg-surface border border-subtle hover:bg-red-50 dark:hover:bg-red-950/40 text-xs text-red-600 font-medium shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <UserX className="w-3 h-3" />
                            <span>Remove line</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={line.id}
                      className="p-2.5 rounded-xl border border-subtle bg-surface flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                    >
                      <div className="w-36 shrink-0">
                        <span className="text-xs font-semibold text-main block truncate">
                          {line.label}:
                        </span>
                      </div>

                      <div className="flex-1">
                        {allowsTyping ? (
                          <input
                            type="text"
                            value={currentValue}
                            onChange={(e) => handleTypedValueChange(line.id, e.target.value)}
                            placeholder={`Type name(s) for ${line.label}...`}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        ) : (
                          <div className="text-xs font-medium text-sec px-2 py-1 rounded-lg bg-subtle/50">
                            {currentValue || '(Assigned)'}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.id)}
                        className="p-1 rounded text-mut hover:text-red-500 self-end sm:self-center cursor-pointer"
                        title="Remove this line from message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Editable Final Message Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider">
                Final Message Text
              </label>
              <div className="flex items-center gap-2">
                {isManuallyEdited && (
                  <button
                    type="button"
                    onClick={() => setIsManuallyEdited(false)}
                    className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                  >
                    Reset to auto-filled
                  </button>
                )}
                <span className="text-[11px] text-mut">Freely edit before copying</span>
              </div>
            </div>

            <textarea
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                setIsManuallyEdited(true);
              }}
              rows={6}
              className="w-full px-3.5 py-3 rounded-xl border border-subtle bg-field text-main text-sm font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              placeholder="Your complete message will appear here..."
            />
          </div>

          {/* Live Messenger Chat Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#0084FF]" />
                <span>Messenger Live Preview</span>
              </label>
              <span className="text-[11px] text-mut font-medium">Standard Messenger Blue bubble</span>
            </div>

            <div className="rounded-2xl border border-subtle bg-field p-4 shadow-xs flex flex-col justify-end">
              <div className="text-[10px] text-center text-mut font-medium mb-2.5">
                {currentOccurrence ? `${currentOccurrence.dayName}, ${currentOccurrence.formattedDate} • ${currentOccurrence.formattedTime}` : 'Today'}
              </div>

              {/* Chat bubble in standard Messenger Blue #0084FF with white text */}
              <div className="max-w-[92%] self-end bg-[#0084FF] text-white p-3.5 sm:p-4 rounded-2xl rounded-tr-xs shadow-md space-y-2 whitespace-pre-wrap text-sm sm:text-[15px] font-sans leading-relaxed break-words">
                {messageText || (
                  <span className="opacity-80 italic text-xs sm:text-sm">
                    Your complete message will appear here...
                  </span>
                )}
              </div>

              <div className="text-[11px] text-right text-mut mt-1 mr-1 font-medium">
                Delivered
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-t border-subtle bg-canvas">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkAsSent}
              disabled={savingMarkSent || markedSent}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                markedSent
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-surface hover:bg-surface-hover text-sec border-subtle'
              }`}
            >
              {markedSent ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : savingMarkSent ? (
                <Spinner size="xs" variant="accent" />
              ) : (
                <Check className="w-4 h-4 text-accent" />
              )}
              <span>{markedSent ? 'Marked as Sent!' : savingMarkSent ? 'Saving...' : 'Mark as Sent'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Copy message button */}
            <button
              type="button"
              onClick={handleCopyMessage}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-surface hover:bg-surface-hover text-main border-subtle shadow-2xs'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 text-accent" />}
              <span>{copied ? 'Copied!' : 'Copy message'}</span>
            </button>

            {/* Copy and open Messenger */}
            <button
              type="button"
              onClick={handleCopyAndOpenMessenger}
              className="px-4 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 text-accent-contrast" />
              <span>Copy and open Messenger</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

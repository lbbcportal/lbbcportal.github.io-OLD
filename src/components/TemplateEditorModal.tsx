import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
  Calendar,
  Sparkles,
  MessageSquare,
  Bell,
  Check,
  ChevronDown,
  Info
} from 'lucide-react';
import {
  MessageTemplate,
  TemplateRoleLine,
  ReminderSettings,
  RegularService,
  OutlineNode
} from '../types';
import {
  getFlatOutlineRoles,
  getUpcomingOccurrences,
  buildMessageContent,
  OccurrenceItem
} from '../lib/templateHelpers';
import { toDateString, formatTime } from '../lib/dateTime';
import { Spinner } from './LoadingIndicator';

interface TemplateEditorModalProps {
  template: MessageTemplate | null; // null if creating new
  isOpen: boolean;
  onClose: () => void;
  onSave: (templateData: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>, customId?: string) => Promise<void>;
  regularServices: RegularService[];
  nodes: OutlineNode[];
}

const SAMPLE_NAMES = ['Mark', 'Sarah', 'James', 'Rachel', 'David', 'Grace', 'Daniel', 'Hannah', 'Peter', 'Ruth'];

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  template,
  isOpen,
  onClose,
  onSave,
  regularServices,
  nodes
}) => {
  if (!isOpen) return null;

  const isEditing = !!template;
  // Stable ID across retries so failed saves do not create duplicate templates when retrying
  const draftIdRef = useRef<string>(template?.id || ('tmpl_' + Math.random().toString(36).substring(2, 10)));

  const [name, setName] = useState(template?.name || '');
  const [linkedServiceId, setLinkedServiceId] = useState(template?.linkedServiceId || '');
  const [headerText, setHeaderText] = useState(
    template?.headerText || 'Greetings church family! Here is our reminder for {service} on {day}, {date} at {time}:'
  );
  const [roleLines, setRoleLines] = useState<TemplateRoleLine[]>(
    template?.roleLines && template.roleLines.length > 0
      ? template.roleLines
      : []
  );
  const [closingText, setClosingText] = useState(template?.closingText || 'Please be at church 15 minutes before the service. God bless!');

  // Reminder settings
  const [reminderEnabled, setReminderEnabled] = useState(template?.reminder?.enabled ?? false);
  const [reminderDaysBefore, setReminderDaysBefore] = useState<number>(template?.reminder?.daysBefore ?? 0);
  const [reminderTimeOfDay, setReminderTimeOfDay] = useState<string>(template?.reminder?.timeOfDay || '09:00');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closingTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Outline roles in tree order
  const flatRoles = useMemo(() => getFlatOutlineRoles(nodes), [nodes]);

  // Insert token at cursor in header text
  const insertToken = (token: string, target: 'header' | 'closing' = 'header') => {
    if (target === 'header') {
      const textarea = textareaRef.current;
      if (!textarea) {
        setHeaderText(prev => prev + ' ' + token);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextText = headerText.substring(0, start) + token + headerText.substring(end);
      setHeaderText(nextText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      const textarea = closingTextareaRef.current;
      if (!textarea) {
        setClosingText(prev => (prev || '') + ' ' + token);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = closingText || '';
      const nextText = current.substring(0, start) + token + current.substring(end);
      setClosingText(nextText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    }
  };

  // Add role line
  const handleAddRoleLine = () => {
    const initialRole = flatRoles[0];
    const newLine: TemplateRoleLine = {
      id: 'line_' + Math.random().toString(36).substring(2, 9),
      label: initialRole ? initialRole.title : 'Song leader',
      source: 'linked_role',
      roleId: initialRole?.id || ''
    };
    setRoleLines(prev => [...prev, newLine]);
  };

  // Move line up / down
  const moveLine = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= roleLines.length) return;
    const copy = [...roleLines];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    setRoleLines(copy);
  };

  // Delete line
  const deleteLine = (index: number) => {
    setRoleLines(prev => prev.filter((_, i) => i !== index));
  };

  // Update line
  const updateLine = (index: number, updates: Partial<TemplateRoleLine>) => {
    setRoleLines(prev => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  };

  // Handle role selection change with auto-fill label
  const handleRoleChange = (idx: number, newRoleId: string) => {
    const selectedRoleNode = nodes.find(n => n.id === newRoleId);
    const currentLine = roleLines[idx];
    const prevRoleNode = nodes.find(n => n.id === currentLine.roleId);
    const shouldAutoFill =
      !currentLine.label.trim() ||
      currentLine.label.trim().toLowerCase() === 'role' ||
      (prevRoleNode && currentLine.label.trim().toLowerCase() === prevRoleNode.title.trim().toLowerCase());

    updateLine(idx, {
      roleId: newRoleId,
      label: shouldAutoFill && selectedRoleNode ? selectedRoleNode.title : currentLine.label
    });
  };

  // Handle source change with auto-fill label
  const handleSourceChange = (idx: number, newSource: 'linked_role' | 'type_each_time') => {
    const currentLine = roleLines[idx];
    if (newSource === 'linked_role') {
      const initialRoleId = currentLine.roleId || flatRoles[0]?.id || '';
      const selectedRoleNode = nodes.find(n => n.id === initialRoleId);
      const shouldAutoFill = !currentLine.label.trim() || currentLine.label.trim().toLowerCase() === 'role';
      updateLine(idx, {
        source: 'linked_role',
        roleId: initialRoleId,
        label: shouldAutoFill && selectedRoleNode ? selectedRoleNode.title : currentLine.label
      });
    } else {
      updateLine(idx, {
        source: 'type_each_time',
        roleId: undefined
      });
    }
  };

  // Sample occurrence for live preview: {day} is strictly weekday ("Wednesday"), {date} is strictly month/day ("November 11")
  const sampleOccurrence = useMemo<OccurrenceItem>(() => {
    if (linkedServiceId) {
      const occurrences = getUpcomingOccurrences(
        regularServices.filter(s => s.id === linkedServiceId),
        [],
        [],
        toDateString(new Date()),
        30
      );
      if (occurrences.length > 0) {
        return occurrences[0];
      }
      const s = regularServices.find(srv => srv.id === linkedServiceId);
      if (s) {
        return {
          id: `sample_${s.id}`,
          type: 'regular_service',
          sourceId: s.id,
          title: s.name,
          date: '2026-11-11',
          startTime: s.startTime || '18:30',
          location: s.location || 'Main Sanctuary',
          dayOfWeek: 3,
          dayName: 'Wednesday',
          formattedDate: 'November 11',
          formattedTime: formatTime(s.startTime || '18:30', '12h'),
          isCancelled: false
        };
      }
    }
    return {
      id: 'sample_service',
      type: 'regular_service',
      sourceId: 'service_1',
      title: 'Wednesday Prayer Meeting',
      date: '2026-11-11',
      startTime: '18:30',
      location: 'Main Sanctuary',
      dayOfWeek: 3,
      dayName: 'Wednesday',
      formattedDate: 'November 11',
      formattedTime: '6:30 PM',
      isCancelled: false
    };
  }, [linkedServiceId, regularServices]);

  // Sample role values for preview: uses realistic names (Mark, Sarah, etc.) instead of brackets
  const sampleRoleValues = useMemo<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    roleLines.forEach((line, idx) => {
      vals[line.id] = SAMPLE_NAMES[idx % SAMPLE_NAMES.length];
    });
    return vals;
  }, [roleLines]);

  // Live preview text
  const previewMessage = useMemo(() => {
    return buildMessageContent(
      headerText,
      roleLines,
      closingText,
      sampleOccurrence,
      sampleRoleValues,
      new Set()
    );
  }, [headerText, roleLines, closingText, sampleOccurrence, sampleRoleValues]);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a template name.');
      return;
    }
    if (!headerText.trim()) {
      setError('Please enter message text.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const reminder: ReminderSettings | undefined = reminderEnabled
        ? {
            enabled: true,
            daysBefore: reminderDaysBefore,
            timeOfDay: reminderTimeOfDay || '09:00'
          }
        : undefined;

      await onSave(
        {
          name: name.trim(),
          linkedServiceId: linkedServiceId || undefined,
          headerText: headerText.trim(),
          roleLines,
          closingText: closingText?.trim() || '',
          reminder
        },
        draftIdRef.current
      );

      // Successfully saved and confirmed by Firebase: close the popup
      onClose();
    } catch (err: any) {
      // If saving fails, keep popup open and show error (do not create duplicate templates on retry)
      setError(err?.message || 'Failed to save template. Please check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tokens = [
    { label: '{service}', desc: 'Service Name' },
    { label: '{day}', desc: 'Weekday (e.g. Wednesday)' },
    { label: '{date}', desc: 'Month and Day (e.g. November 11)' },
    { label: '{time}', desc: '12-hour Time (e.g. 6:30 PM)' },
    { label: '{location}', desc: 'Location' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto motion-backdrop-in">
      <div className="relative w-full max-w-4xl sm:max-w-5xl bg-surface border border-subtle rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden motion-popup-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle bg-canvas shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-tint text-accent flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-main">
                {isEditing ? 'Edit Message Template' : 'New Message Template'}
              </h2>
              <p className="text-xs text-mut">
                Create structured service reminders ready to send or share on Messenger
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6">
          {error && (
            <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
            {/* Left 7 cols: Editor Fields */}
            <div className="lg:col-span-7 space-y-5 min-w-0 overflow-hidden">
              {/* Template Name */}
              <div>
                <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wednesday Prayer Meeting reminder"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Linked Service */}
              <div>
                <label className="block text-xs font-semibold text-main uppercase tracking-wider mb-1.5">
                  Linked Regular Service (Optional)
                </label>
                <select
                  value={linkedServiceId}
                  onChange={(e) => setLinkedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent cursor-pointer"
                >
                  <option value="">No linked service (Generic template)</option>
                  {regularServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} {service.kind === 'activity' ? '(Activity)' : ''} ({service.startTime})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-mut block mt-1">
                  When linked, upcoming occurrences and roster assignments will be automatically pulled for this service.
                </span>
              </div>

              {/* Header Text & Tokens */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-main uppercase tracking-wider">
                    Message Text <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-mut">Tokens replace with real details</span>
                </div>

                {/* Token Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2 p-2 rounded-xl bg-subtle/50 border border-subtle">
                  <span className="text-[11px] font-medium text-mut mr-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-accent" /> Insert Token:
                  </span>
                  {tokens.map(t => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => insertToken(t.label, 'header')}
                      className="px-2 py-0.5 rounded-md bg-surface hover:bg-accent-tint hover:text-accent border border-subtle text-xs font-mono text-sec transition-colors cursor-pointer"
                      title={t.desc}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  rows={3}
                  placeholder="e.g. Greetings church family! Here is our reminder for {service} on {day}, {date} at {time}:"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent font-sans leading-relaxed"
                />
              </div>

              {/* Role Lines Builder */}
              <div className="pt-2 border-t border-subtle">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-main uppercase tracking-wider">
                      Role Lines
                    </label>
                    <span className="text-[11px] text-mut">
                      Ordered list of roles to include in the reminder
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRoleLine}
                    className="px-2.5 py-1 rounded-lg bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-accent-contrast" />
                    <span>Add Role Line</span>
                  </button>
                </div>

                {roleLines.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-subtle bg-subtle/30 text-center text-xs text-mut">
                    No role lines added yet. Click &ldquo;Add Role Line&rdquo; to include assignments (e.g. Song leader, Pianist, Preacher).
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {roleLines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="p-3 rounded-xl border border-subtle bg-surface hover:border-accent/30 transition-all flex items-start sm:items-center gap-2.5 w-full min-w-0 overflow-hidden"
                      >
                        {/* Reorder Buttons on left inside row border */}
                        <div className="flex items-center gap-0.5 shrink-0 pt-1 sm:pt-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveLine(idx, 'up')}
                            className="p-1 rounded hover:bg-subtle text-mut hover:text-main disabled:opacity-30 cursor-pointer"
                            title="Move line up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === roleLines.length - 1}
                            onClick={() => moveLine(idx, 'down')}
                            className="p-1 rounded hover:bg-subtle text-mut hover:text-main disabled:opacity-30 cursor-pointer"
                            title="Move line down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Center area: Label input taking available width, dropdowns sitting beside it when there is room and wrapping when not */}
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                          {/* Label Input takes available width */}
                          <div className="flex-1 min-w-[120px]">
                            <input
                              type="text"
                              value={line.label}
                              onChange={(e) => updateLine(idx, { label: e.target.value })}
                              placeholder="Role label (e.g. Song leader)"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          </div>

                          {/* Source and Role Dropdowns: sit beside when room, wrap to second line when not */}
                          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-full">
                            <select
                              value={line.source}
                              onChange={(e) => handleSourceChange(idx, e.target.value as 'linked_role' | 'type_each_time')}
                              className="shrink-0 px-2 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer text-ellipsis"
                            >
                              <option value="linked_role">Linked to role</option>
                              <option value="type_each_time">Type each time</option>
                            </select>

                            {line.source === 'linked_role' ? (
                              <select
                                value={line.roleId || ''}
                                onChange={(e) => handleRoleChange(idx, e.target.value)}
                                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer truncate"
                              >
                                <option value="">Select role from outline...</option>
                                {flatRoles.map(r => (
                                  <option key={r.id} value={r.id}>
                                    {'—'.repeat(r.depth)} {r.title}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] text-mut italic py-1 truncate">
                                Prompt to type name(s)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delete Button on far right inside row border */}
                        <div className="shrink-0 pt-1 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => deleteLine(idx)}
                            className="p-1.5 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                            title="Delete line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Closing Text */}
              <div className="pt-2 border-t border-subtle">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-main uppercase tracking-wider">
                    Closing Text (Optional)
                  </label>
                  <span className="text-[11px] text-mut">Appended below role lines</span>
                </div>
                <textarea
                  ref={closingTextareaRef}
                  value={closingText}
                  onChange={(e) => setClosingText(e.target.value)}
                  rows={2}
                  placeholder="e.g. Please be at church 15 minutes before the service. God bless!"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              </div>

              {/* Reminder Settings */}
              <div className="pt-4 border-t border-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-accent" />
                    <span className="text-xs font-semibold text-main uppercase tracking-wider">
                      Reminder Settings
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reminderEnabled}
                      onChange={(e) => setReminderEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-strong after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>

                {reminderEnabled && (
                  <div className="p-3.5 rounded-xl bg-subtle/50 border border-subtle space-y-3 animate-in fade-in duration-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-sec font-medium mb-1">
                          Remind me:
                        </label>
                        <select
                          value={reminderDaysBefore}
                          onChange={(e) => setReminderDaysBefore(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
                        >
                          <option value={0}>On the day of the service</option>
                          <option value={1}>1 day before</option>
                          <option value={2}>2 days before</option>
                          <option value={3}>3 days before</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-sec font-medium mb-1">
                          Starting at time of day:
                        </label>
                        <div className="relative">
                          <input
                            type="time"
                            value={reminderTimeOfDay}
                            onChange={(e) => setReminderTimeOfDay(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-mut flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>
                        When due, a reminder prompt appears on your Home dashboard until marked sent or service passes.
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 cols: Live Chat Bubble Preview */}
            <div className="lg:col-span-5 flex flex-col min-w-0">
              <div className="sticky top-2 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-accent" />
                    <span>Live Chat Preview</span>
                  </span>
                  <span className="text-[10px] text-mut uppercase font-semibold bg-subtle px-2 py-0.5 rounded-md">
                    Sample Next Service
                  </span>
                </div>

                {/* Simulated Messenger Chat Window */}
                <div className="rounded-2xl border border-subtle bg-field p-4 shadow-xs flex flex-col justify-end min-h-[300px]">
                  <div className="text-[10px] text-center text-mut font-medium my-2">
                    Wednesday, {sampleOccurrence.formattedDate} • {sampleOccurrence.formattedTime}
                  </div>

                  {/* Chat bubble in Messenger Blue */}
                  <div className="max-w-[92%] self-end bg-[#0084FF] text-white p-3.5 sm:p-4 rounded-2xl rounded-tr-xs shadow-md space-y-2 whitespace-pre-wrap text-sm sm:text-[15px] font-sans leading-relaxed break-words">
                    {previewMessage || (
                      <span className="opacity-80 italic text-xs sm:text-sm">
                        Start typing your message text to see live preview...
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-right text-mut mt-1 mr-1 font-medium">
                    Delivered
                  </div>
                </div>

                <div className="text-xs text-mut p-2.5 rounded-xl bg-subtle/30 border border-subtle">
                  💡 Tokens like <code className="text-accent font-semibold">{'{day}'}</code> (&ldquo;Wednesday&rdquo;) and <code className="text-accent font-semibold">{'{date}'}</code> (&ldquo;November 11&rdquo;) format as &ldquo;on Wednesday, November 11 at 6:30 PM&rdquo;.
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-subtle shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="xs" variant="contrast" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-accent-contrast" />
                  <span>{isEditing ? 'Save Changes' : 'Create Template'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

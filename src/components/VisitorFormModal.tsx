import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Plus, Trash2, AlertTriangle, Calendar, UserCheck, Check } from 'lucide-react';
import {
  Visitor,
  VisitorCivilStatus,
  VisitorFollowUpStatus,
  RegularService,
  Person
} from '../types';
import { formatDate, getTodayString } from '../lib/dateTime';
import { getMostRecentSunday, normalizeVisitDates } from '../lib/visitorHelpers';
import { Spinner } from './LoadingIndicator';

const CIVIL_STATUS_OPTIONS: VisitorCivilStatus[] = [
  'Single',
  'Married',
  'Widowed',
  'Separated',
  'Other'
];

const FOLLOW_UP_OPTIONS: VisitorFollowUpStatus[] = [
  'To follow up',
  'Followed up',
  'Not needed'
];

interface VisitorFormModalProps {
  isOpen: boolean;
  editingVisitor: Visitor | null;
  visitors: Visitor[];
  people: Person[];
  regularServices: RegularService[];
  onClose: () => void;
  onSaveNew: (data: Omit<Visitor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  onUpdateExisting: (id: string, updates: Partial<Visitor>) => Promise<void>;
  onAddReturnVisit: (id: string, visitDate: string) => Promise<void>;
}

export const VisitorFormModal: React.FC<VisitorFormModalProps> = ({
  isOpen,
  editingVisitor,
  visitors,
  people,
  regularServices,
  onClose,
  onSaveNew,
  onUpdateExisting,
  onAddReturnVisit
}) => {
  const defaultSunday = useMemo(() => getMostRecentSunday(), []);

  const [visitDate, setVisitDate] = useState<string>(defaultSunday);
  const [serviceChoice, setServiceChoice] = useState<string>('');
  const [customServiceName, setCustomServiceName] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<string>('');
  const [civilStatus, setCivilStatus] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [barangay, setBarangay] = useState<string>('');
  const [contact, setContact] = useState<string>('');
  const [invitedBy, setInvitedBy] = useState<string>('');
  const [followUpStatus, setFollowUpStatus] = useState<VisitorFollowUpStatus>('To follow up');
  const [followUpNote, setFollowUpNote] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [editVisits, setEditVisits] = useState<string[]>([]);
  const [newExtraVisitDate, setNewExtraVisitDate] = useState<string>(getTodayString());

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Duplicate detection state
  const [duplicateMatch, setDuplicateMatch] = useState<Visitor | null>(null);
  const [pendingAddAnother, setPendingAddAnother] = useState<boolean>(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const serviceOptions = useMemo(() => {
    return Array.from(new Set(regularServices.map(s => s.name).filter(Boolean)));
  }, [regularServices]);

  const barangaySuggestions = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => {
      if (p.barangay?.trim()) set.add(p.barangay.trim());
    });
    visitors.forEach(v => {
      if (v.barangay?.trim()) set.add(v.barangay.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people, visitors]);

  const inviterSuggestions = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setDuplicateMatch(null);
    setPendingAddAnother(false);
    setIsSubmitting(false);

    if (editingVisitor) {
      const visitsList = normalizeVisitDates(editingVisitor.visits || []);
      setEditVisits(visitsList);
      setVisitDate(visitsList[0] || defaultSunday);
      const svc = editingVisitor.serviceName || '';
      if (!svc) {
        setServiceChoice('');
        setCustomServiceName('');
      } else if (serviceOptions.includes(svc)) {
        setServiceChoice(svc);
        setCustomServiceName('');
      } else if (svc === 'Other') {
        setServiceChoice('Other');
        setCustomServiceName('');
      } else {
        setServiceChoice('Other');
        setCustomServiceName(svc);
      }
      setName(editingVisitor.name || '');
      setAge(editingVisitor.age !== undefined && editingVisitor.age !== null ? String(editingVisitor.age) : '');
      setCivilStatus(editingVisitor.civilStatus || '');
      setAddress(editingVisitor.address || '');
      setBarangay(editingVisitor.barangay || '');
      setContact(editingVisitor.contact || '');
      setInvitedBy(editingVisitor.invitedBy || '');
      setFollowUpStatus(editingVisitor.followUpStatus || 'To follow up');
      setFollowUpNote(editingVisitor.followUpNote || '');
      setNotes(editingVisitor.notes || '');
      setNewExtraVisitDate(getTodayString());
    } else {
      setEditVisits([]);
      setVisitDate(getMostRecentSunday());
      setServiceChoice('');
      setCustomServiceName('');
      setName('');
      setAge('');
      setCivilStatus('');
      setAddress('');
      setBarangay('');
      setContact('');
      setInvitedBy('');
      setFollowUpStatus('To follow up');
      setFollowUpNote('');
      setNotes('');
    }
  }, [isOpen, editingVisitor, defaultSunday, serviceOptions]);

  if (!isOpen) return null;

  const resolvedServiceName = (() => {
    if (!serviceChoice) return '';
    if (serviceChoice === 'Other') {
      return customServiceName.trim() || 'Other';
    }
    return serviceChoice;
  })();

  const resetPersonFieldsForBatch = () => {
    setName('');
    setAge('');
    setCivilStatus('');
    setAddress('');
    setBarangay('');
    setContact('');
    setInvitedBy('');
    setFollowUpStatus('To follow up');
    setFollowUpNote('');
    setNotes('');
    setErrorMsg('');
    setDuplicateMatch(null);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
  };

  const buildNewVisitorPayload = (): Omit<Visitor, 'id' | 'createdAt' | 'updatedAt'> => {
    const parsedAge = age.trim() !== '' ? Number(age.trim()) : undefined;
    return {
      name: name.trim(),
      age: parsedAge !== undefined && !Number.isNaN(parsedAge) && parsedAge >= 0 ? parsedAge : undefined,
      civilStatus: civilStatus ? (civilStatus as VisitorCivilStatus) : undefined,
      address: address.trim() || undefined,
      barangay: barangay.trim() || undefined,
      contact: contact.trim() || undefined,
      invitedBy: invitedBy.trim() || undefined,
      serviceName: resolvedServiceName || undefined,
      visits: [visitDate],
      followUpStatus,
      followUpNote: followUpNote.trim() || undefined,
      notes: notes.trim() || undefined
    };
  };

  const commitNewVisitor = async (addAnother: boolean) => {
    setIsSubmitting(true);
    try {
      await onSaveNew(buildNewVisitorPayload());
      if (addAnother) {
        resetPersonFieldsForBatch();
      } else {
        onClose();
      }
    } catch {
      setErrorMsg('Failed to save visitor. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async (addAnother: boolean) => {
    setErrorMsg('');
    if (!editingVisitor && !visitDate) {
      setErrorMsg('Please select a visit date.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Full name is required.');
      return;
    }
    if (age.trim() !== '') {
      const n = Number(age.trim());
      if (Number.isNaN(n) || n < 0 || n > 130) {
        setErrorMsg('Please enter a valid age (0–130).');
        return;
      }
    }

    if (editingVisitor) {
      if (editVisits.length === 0) {
        setErrorMsg('A visitor must have at least one visit date.');
        return;
      }
      setIsSubmitting(true);
      try {
        const parsedAge = age.trim() !== '' ? Number(age.trim()) : undefined;
        await onUpdateExisting(editingVisitor.id, {
          name: name.trim(),
          age: parsedAge !== undefined && !Number.isNaN(parsedAge) ? parsedAge : undefined,
          civilStatus: civilStatus ? (civilStatus as VisitorCivilStatus) : undefined,
          address: address.trim() || undefined,
          barangay: barangay.trim() || undefined,
          contact: contact.trim() || undefined,
          invitedBy: invitedBy.trim() || undefined,
          serviceName: resolvedServiceName || undefined,
          visits: normalizeVisitDates(editVisits),
          followUpStatus,
          followUpNote: followUpNote.trim() || undefined,
          notes: notes.trim() || undefined
        });
        onClose();
      } catch {
        setErrorMsg('Failed to update visitor. Check your connection and try again.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Check duplicate name (case-insensitive trimmed match)
    const normalizedInput = name.trim().toLowerCase();
    const existingMatch = visitors.find(v => v.name.trim().toLowerCase() === normalizedInput);
    if (existingMatch) {
      setDuplicateMatch(existingMatch);
      setPendingAddAnother(addAnother);
      return;
    }

    await commitNewVisitor(addAnother);
  };

  const handleConfirmReturnVisit = async () => {
    if (!duplicateMatch) return;
    setIsSubmitting(true);
    try {
      await onAddReturnVisit(duplicateMatch.id, visitDate);
      setDuplicateMatch(null);
      if (pendingAddAnother) {
        resetPersonFieldsForBatch();
      } else {
        onClose();
      }
    } catch {
      setErrorMsg('Failed to add return visit. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEditVisit = (dateToRemove: string) => {
    if (editVisits.length <= 1) return;
    setEditVisits(prev => prev.filter(d => d !== dateToRemove));
  };

  const handleAddEditVisitDate = () => {
    if (!newExtraVisitDate) return;
    setEditVisits(prev => normalizeVisitDates([...prev, newExtraVisitDate]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs motion-backdrop-in">
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-surface border border-subtle shadow-2xl text-main overflow-hidden motion-popup-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="visitor-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-subtle bg-subtle/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent-tint text-accent">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="visitor-modal-title" className="text-base font-bold text-main">
                {editingVisitor ? 'Edit Visitor' : 'Add Visitor'}
              </h2>
              <p className="text-xs text-sec">
                {editingVisitor
                  ? 'Update visitor details or manage visit dates'
                  : 'Enter slip details after service'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-mut hover:text-main hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Visit Date + Service Attended (for new visitor) or Service Attended (for edit) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {!editingVisitor ? (
              <div>
                <label className="block text-xs font-semibold text-sec mb-1">
                  Visit Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-sec mb-1">
                  First Visit Date
                </label>
                <div className="px-3 py-2 rounded-lg border border-subtle bg-subtle/60 text-sm text-sec flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-mut" />
                  <span>{editVisits[0] ? formatDate(editVisits[0]) : '—'}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Service Attended
              </label>
              <select
                value={serviceChoice}
                onChange={(e) => setServiceChoice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              >
                <option value="">Select service (optional)</option>
                {serviceOptions.map(svc => (
                  <option key={svc} value={svc}>{svc}</option>
                ))}
                <option value="Other">Other</option>
              </select>
              {serviceChoice === 'Other' && (
                <input
                  type="text"
                  value={customServiceName}
                  onChange={(e) => setCustomServiceName(e.target.value)}
                  placeholder="Specify service name (optional)"
                  className="mt-2 w-full px-3 py-1.5 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
              )}
            </div>
          </div>

          {/* Row 2: Full Name, Age, Civil Status */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-sec mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                autoFocus
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-sec mb-1">
                Age
              </label>
              <input
                type="number"
                min={0}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-sec mb-1">
                Civil Status
              </label>
              <select
                value={civilStatus}
                onChange={(e) => setCivilStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              >
                <option value="">Select (optional)</option>
                {CIVIL_STATUS_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Barangay & Contact Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Barangay
              </label>
              <input
                type="text"
                list="visitor-barangay-suggestions"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                placeholder="Type or choose barangay"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
              <datalist id="visitor-barangay-suggestions">
                {barangaySuggestions.map(b => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Contact Number
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. 0917 123 4567"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
          </div>

          {/* Row 4: Address & Invited By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House/street/sitio"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Invited By
              </label>
              <input
                type="text"
                list="visitor-inviter-suggestions"
                value={invitedBy}
                onChange={(e) => setInvitedBy(e.target.value)}
                placeholder="Member name or walk-in"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
              <datalist id="visitor-inviter-suggestions">
                {inviterSuggestions.map(inv => (
                  <option key={inv} value={inv} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 5: Follow-up Status & Optional Follow-up Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Follow-up Status
              </label>
              <select
                value={followUpStatus}
                onChange={(e) => setFollowUpStatus(e.target.value as VisitorFollowUpStatus)}
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              >
                {FOLLOW_UP_OPTIONS.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-sec mb-1">
                Follow-up Note <span className="text-mut font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                placeholder="e.g. Requested prayer / home visit"
                className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
          </div>

          {/* Row 6: Notes */}
          <div>
            <label className="block text-xs font-semibold text-sec mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes from the visitor slip..."
              className="w-full px-3 py-2 rounded-lg border border-subtle bg-field text-main text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-y"
            />
          </div>

          {/* Edit Mode: Visit Dates List */}
          {editingVisitor && (
            <div className="p-3.5 rounded-xl border border-subtle bg-subtle/50 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-bold text-main uppercase tracking-wider">
                    Visit Dates ({editVisits.length})
                  </h3>
                  <p className="text-[11px] text-sec">
                    Remove mistaken dates or log another visit date
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={newExtraVisitDate}
                    onChange={(e) => setNewExtraVisitDate(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-subtle bg-field text-main text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="button"
                    onClick={handleAddEditVisitDate}
                    className="px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {editVisits.map((d, idx) => (
                  <div
                    key={d}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-subtle bg-surface text-xs text-main"
                  >
                    <Calendar className="w-3 h-3 text-accent shrink-0" />
                    <span className="font-medium">
                      {formatDate(d)}
                      {idx === 0 && (
                        <span className="ml-1.5 text-[10px] text-mut">(First)</span>
                      )}
                    </span>
                    {editVisits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEditVisit(d)}
                        className="text-mut hover:text-red-600 transition-colors cursor-pointer"
                        title={`Remove visit ${d}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-subtle bg-subtle/40 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          {!editingVisitor && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-accent text-accent hover:bg-accent-tint text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? <Spinner size="xs" variant="accent" /> : <Plus className="w-4 h-4" />}
              <span>{isSubmitting ? 'Saving...' : 'Save and add another'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
          >
            {isSubmitting ? <Spinner size="xs" variant="contrast" /> : <Check className="w-4 h-4" />}
            <span>{isSubmitting ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

        {/* Duplicate Name Prompt Overlay */}
        {duplicateMatch && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
            <div className="w-full max-w-md p-5 rounded-xl bg-surface border border-subtle shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-main">
                    Existing Visitor Found
                  </h3>
                  <p className="text-xs text-sec mt-1 leading-relaxed">
                    A visitor with this name already exists. Add this as a return visit instead?
                  </p>
                  <div className="mt-2.5 p-2.5 rounded-lg bg-subtle border border-subtle text-xs space-y-0.5">
                    <div className="font-semibold text-main">{duplicateMatch.name}</div>
                    <div className="text-sec">
                      Visited {duplicateMatch.visits?.length || 0} {(duplicateMatch.visits?.length || 0) === 1 ? 'time' : 'times'}
                      {duplicateMatch.barangay ? ` · Brgy. ${duplicateMatch.barangay}` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateMatch(null)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-sec text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setDuplicateMatch(null);
                    await commitNewVisitor(pendingAddAnother);
                  }}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg border border-subtle bg-surface hover:bg-surface-hover text-main text-xs font-semibold cursor-pointer"
                >
                  Save as new
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturnVisit}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSubmitting && <Spinner size="xs" variant="contrast" />}
                  <span>{isSubmitting ? 'Saving...' : 'Add as return visit'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

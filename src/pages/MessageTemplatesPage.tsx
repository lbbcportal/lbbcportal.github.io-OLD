import React, { useState } from 'react';
import {
  MessageSquare,
  Plus,
  Edit2,
  Copy,
  Trash2,
  Send,
  Bell,
  Calendar,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
  ListOrdered
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { MessageTemplate } from '../types';
import { TemplateEditorModal } from '../components/TemplateEditorModal';
import { WriteMessageModal } from '../components/WriteMessageModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatTime } from '../lib/dateTime';
import { PageLoading } from '../components/LoadingIndicator';

interface MessageTemplatesPageProps {
  onNavigate?: (tab: string) => void;
}

export const MessageTemplatesPage: React.FC<MessageTemplatesPageProps> = ({ onNavigate }) => {
  const {
    messageTemplates,
    addMessageTemplate,
    updateMessageTemplate,
    deleteMessageTemplate,
    duplicateMessageTemplate,
    regularServices,
    nodes,
    dataLoading
  } = useData();

  // Modals state
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<MessageTemplate | null>(null);

  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [selectedTemplateForWrite, setSelectedTemplateForWrite] = useState<MessageTemplate | null>(null);

  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);

  // Open Create Modal
  const handleOpenCreate = () => {
    setSelectedTemplateForEdit(null);
    setEditorModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (template: MessageTemplate) => {
    setSelectedTemplateForEdit(template);
    setEditorModalOpen(true);
  };

  // Open Write Modal
  const handleOpenWrite = (template: MessageTemplate) => {
    setSelectedTemplateForWrite(template);
    setWriteModalOpen(true);
  };

  // Save Template (Create or Update)
  const handleSaveTemplate = async (
    data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
    customId?: string
  ) => {
    if (selectedTemplateForEdit) {
      await updateMessageTemplate(selectedTemplateForEdit.id, data);
    } else {
      await addMessageTemplate(data, customId);
    }
  };

  // Duplicate Template
  const handleDuplicate = async (templateId: string) => {
    try {
      await duplicateMessageTemplate(templateId);
    } catch (err) {
      console.error('Failed to duplicate template', err);
    }
  };

  // Delete Template
  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      await deleteMessageTemplate(templateToDelete.id);
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Failed to delete template', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 motion-page-enter">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-subtle">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main flex items-center gap-2.5">
            <MessageSquare className="w-6 h-6 text-accent" />
            <span>Message Templates</span>
          </h1>
          <p className="text-xs sm:text-sm text-mut mt-0.5">
            Compose and automate reminders for regular services and events, ready to copy or send to Messenger
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4 text-accent-contrast" />
          <span>New Template</span>
        </button>
      </div>

      {dataLoading.templates ? (
        <PageLoading />
      ) : messageTemplates.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl border-2 border-dashed border-subtle bg-surface/50 max-w-2xl mx-auto my-6 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-tint text-accent flex items-center justify-center mx-auto shadow-2xs">
            <MessageSquare className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-main">
              No message templates yet
            </h3>
            <p className="text-xs sm:text-sm text-mut max-w-md mx-auto">
              Create your first template to easily generate structured service reminders with roster assignments,
              ready to copy or send to your church Messenger group.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-5 py-2.5 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-accent-contrast" />
            <span>Create your first template</span>
          </button>
        </div>
      ) : (
        /* Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 motion-list-enter">
          {messageTemplates.map((template) => {
            const linkedService = regularServices.find(s => s.id === template.linkedServiceId);

            return (
              <div
                key={template.id}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border border-subtle bg-surface hover:shadow-md hover:border-accent/30 motion-card"
              >
                <div className="space-y-3">
                  {/* Card Title & Top Badges */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-main text-base group-hover:text-accent transition-colors line-clamp-1">
                        {template.name}
                      </h3>
                    </div>

                    {/* Linked Service Badge & Reminder Chip */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {linkedService ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-accent-tint text-accent border border-accent/25">
                          <LinkIcon className="w-3 h-3 text-accent shrink-0" />
                          <span>{linkedService.name}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-subtle text-sec border border-subtle">
                          <span>Generic Service</span>
                        </span>
                      )}

                      {/* Reminder status badge */}
                      {template.reminder?.enabled && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-accent-tint text-accent border border-accent/25">
                          <Bell className="w-3 h-3 text-accent shrink-0" />
                          <span>
                            {template.reminder.daysBefore === 0
                              ? 'Day of service'
                              : `${template.reminder.daysBefore}d before`}{' '}
                            at {formatTime(template.reminder.timeOfDay || '09:00', '12h')}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Short Preview in clean white card with standard Messenger blue bubble */}
                  <div className="p-3.5 rounded-xl bg-field border border-subtle shadow-2xs space-y-2.5">
                    <div
                      className="max-w-[95%] ml-auto text-white p-2.5 rounded-2xl rounded-tr-xs shadow-xs text-xs font-sans leading-relaxed break-words"
                      style={{ backgroundColor: '#0084FF' }}
                    >
                      <p className="line-clamp-2">
                        {template.headerText || 'No message text'}
                      </p>
                    </div>
                    <div className="text-[10px] text-right text-mut mr-1">
                      Delivered
                    </div>

                    {template.roleLines && template.roleLines.length > 0 && (
                      <div className="pt-2 border-t border-subtle/70 flex flex-wrap items-center gap-1 text-[11px] text-mut">
                        <ListOrdered className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span className="font-medium text-mut">{template.roleLines.length} role lines:</span>
                        <span className="text-sec font-semibold truncate max-w-[180px]">
                          {template.roleLines.map(l => l.label).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="mt-5 pt-3.5 border-t border-subtle flex items-center justify-between gap-2">
                  {/* Primary: Write Message */}
                  <button
                    type="button"
                    onClick={() => handleOpenWrite(template)}
                    className="px-3.5 py-2 rounded-xl bg-accent text-accent-contrast text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-accent-contrast" />
                    <span>Write message</span>
                  </button>

                  {/* Secondary actions: Edit, Duplicate, Delete */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(template)}
                      className="p-2 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                      title="Edit template"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(template.id)}
                      className="p-2 rounded-lg text-sec hover:text-main hover:bg-subtle transition-colors cursor-pointer"
                      title="Duplicate template"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateToDelete(template)}
                      className="p-2 rounded-lg text-mut hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Editor Modal */}
      {editorModalOpen && (
        <TemplateEditorModal
          isOpen={editorModalOpen}
          template={selectedTemplateForEdit}
          onClose={() => setEditorModalOpen(false)}
          onSave={handleSaveTemplate}
          regularServices={regularServices}
          nodes={nodes}
        />
      )}

      {/* Write Message Modal */}
      {writeModalOpen && selectedTemplateForWrite && (
        <WriteMessageModal
          isOpen={writeModalOpen}
          template={selectedTemplateForWrite}
          onClose={() => {
            setWriteModalOpen(false);
            setSelectedTemplateForWrite(null);
          }}
        />
      )}

      {/* Confirm Delete Modal */}
      {templateToDelete && (
        <ConfirmModal
          isOpen={!!templateToDelete}
          title="Delete Message Template"
          message={`Are you sure you want to delete "${templateToDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete Template"
          isDestructive={true}
          onConfirm={handleConfirmDelete}
          onCancel={() => setTemplateToDelete(null)}
        />
      )}
    </div>
  );
};

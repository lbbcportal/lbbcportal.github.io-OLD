import React from 'react';
import {
  CheckSquare,
  MessageSquare,
  FileText,
  UserCheck,
  BookOpen,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface ComingSoonPageProps {
  featureKey: 'tasks' | 'message-templates' | 'quick-notes' | 'visitors' | 'sunday-school';
  onNavigate: (tab: string) => void;
}

const FEATURE_INFO = {
  tasks: {
    title: 'Church Secretary Tasks & Checklist',
    description: 'Weekly bulletin preparation, altar flower reminders, maintenance checklists, and pastoral request tracking.',
    stage: 'Stage 2',
    icon: CheckSquare
  },
  'message-templates': {
    title: 'Ministry Message Templates',
    description: 'Pre-written email & SMS templates for volunteer reminders, bereavement notifications, and Sunday announcements.',
    stage: 'Stage 3',
    icon: MessageSquare
  },
  'quick-notes': {
    title: 'Secretary Quick Notes & Jotter',
    description: 'Instant scratchpad for phone messages, pastoral prayers, and urgent secretary reminders on the go.',
    stage: 'Stage 2',
    icon: FileText
  },
  visitors: {
    title: 'First-Time Visitors & Follow-Up',
    description: 'Welcome card tracking, follow-up correspondence dates, and visitor retention insights.',
    stage: 'Stage 3',
    icon: UserCheck
  },
  'sunday-school': {
    title: 'Sunday School & Attendance Digitization',
    description: 'Handwritten attendance sheet scanning to digital Word reports and student class rosters.',
    stage: 'Stage 4',
    icon: BookOpen
  }
};

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ featureKey, onNavigate }) => {
  const info = FEATURE_INFO[featureKey] || FEATURE_INFO.tasks;
  const Icon = info.icon;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center motion-page-enter">
      <div className="p-10 rounded-3xl bg-surface border border-subtle shadow-card space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-accent-tint text-accent mx-auto flex items-center justify-center border border-accent/20">
          <Icon className="w-8 h-8" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent-tint text-accent uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Scheduled for {info.stage}</span>
          </div>
          <h2 className="text-2xl font-bold text-main tracking-tight">{info.title}</h2>
          <p className="text-sm text-sec leading-relaxed">{info.description}</p>
        </div>

        <div className="p-4 rounded-xl bg-subtle border border-subtle max-w-lg mx-auto text-xs text-mut leading-relaxed">
          The foundation for this module has been cleanly architected in Stage 1's Firebase and relational data model. It will integrate seamlessly with your existing People directory and Calendar.
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-contrast text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>Return to Workspace Home</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

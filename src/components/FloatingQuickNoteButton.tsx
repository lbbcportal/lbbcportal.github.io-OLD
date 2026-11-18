/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { QuickAddNoteModal } from './QuickAddNoteModal';

export const FloatingQuickNoteButton: React.FC = () => {
  const { addNote } = useData();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 sm:bottom-7 sm:right-7 z-30 w-12 h-12 rounded-full bg-accent hover:opacity-95 text-accent-contrast shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 select-none"
        title="Add quick note"
        aria-label="Add quick note"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {isOpen && (
        <QuickAddNoteModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSave={async (text) => {
            await addNote(text);
          }}
        />
      )}
    </>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ListOrdered,
  Indent,
  Sparkles,
  Eye,
  X,
  Maximize2,
  RotateCcw
} from 'lucide-react';
import { ForerunnerFormatSettings } from '../types';
import { cleanAndFormatLessonText } from '../lib/lessonFormatter';

interface ForerunnerEditorProps {
  contentHtml: string;
  onChange: (html: string) => void;
  photos: { id: string; url: string; name: string }[];
  settings?: ForerunnerFormatSettings;
}

export const ForerunnerEditor: React.FC<ForerunnerEditorProps> = ({
  contentHtml,
  onChange,
  photos,
  settings
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [unclearCount, setUnclearCount] = useState(0);
  const [previousHtml, setPreviousHtml] = useState<string | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  // Sync initial or external content into contentEditable
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== contentHtml) {
      editorRef.current.innerHTML = contentHtml || '<p>Type or paste lesson text here...</p>';
      countUnclearSpans();
    }
  }, [contentHtml]);

  const countUnclearSpans = () => {
    if (!editorRef.current) return;
    const spans = editorRef.current.querySelectorAll('.unclear, [data-unclear="true"]');
    setUnclearCount(spans.length);
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange(html);
    countUnclearSpans();
  };

  const formatDoc = (cmd: string, val: string = '') => {
    document.execCommand(cmd, false, val);
    handleInput();
  };

  // Toggle first line indent on the current selected paragraph
  const toggleFirstLineIndent = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    let node: Node | null = range.startContainer;

    while (node && node !== editorRef.current && node.nodeName !== 'P' && node.nodeName !== 'DIV') {
      node = node.parentNode;
    }

    if (node && node !== editorRef.current) {
      const el = node as HTMLElement;
      if (el.style.textIndent === '1.5em' || el.classList.contains('indent')) {
        el.style.textIndent = '';
        el.classList.remove('indent');
        el.removeAttribute('data-indent');
      } else {
        el.style.textIndent = '1.5em';
        el.classList.add('indent');
        el.setAttribute('data-indent', 'true');
      }
      handleInput();
    } else {
      // Default fallback
      document.execCommand('indent', false);
      handleInput();
    }
  };

  // Clear a specific clicked unclear word
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && (target.classList.contains('unclear') || target.getAttribute('data-unclear') === 'true')) {
      target.classList.remove('unclear');
      target.removeAttribute('data-unclear');
      target.removeAttribute('title');
      // replace outer tag with inner text
      const parent = target.parentNode;
      if (parent) {
        while (target.firstChild) {
          parent.insertBefore(target.firstChild, target);
        }
        parent.removeChild(target);
      }
      handleInput();
    }
  };

  // Clear all remaining unclear badges at once
  const handleClearAllUnclear = () => {
    if (!editorRef.current) return;
    const spans = editorRef.current.querySelectorAll('.unclear, [data-unclear="true"]');
    spans.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
      }
    });
    handleInput();
  };

  // Smart paste handler: automatically clean and convert pasted content
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const htmlData = e.clipboardData.getData('text/html');
    const textData = e.clipboardData.getData('text/plain');
    const inputToClean = htmlData || textData;
    if (!inputToClean) return;

    // Save previous state for Undo
    const currentHtml = editorRef.current?.innerHTML || contentHtml;
    setPreviousHtml(currentHtml);
    setShowUndo(true);

    const cleaned = cleanAndFormatLessonText(inputToClean, {
      defaultAlignment: settings?.defaultAlignment || 'justified'
    });

    const isEssentiallyEmpty = !currentHtml ||
      currentHtml === '<p></p>' ||
      currentHtml === '<p>Type or paste lesson text here...</p>' ||
      currentHtml === '<p><br></p>';

    if (isEssentiallyEmpty) {
      if (editorRef.current) {
        editorRef.current.innerHTML = cleaned;
      }
      onChange(cleaned);
    } else {
      document.execCommand('insertHTML', false, cleaned);
      handleInput();
    }
  };

  // Fix Formatting button handler (cleans the whole current text)
  const handleFixFormatting = () => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    if (!currentHtml || currentHtml === '<p></p>') return;

    setPreviousHtml(currentHtml);
    setShowUndo(true);

    const cleaned = cleanAndFormatLessonText(currentHtml, {
      defaultAlignment: settings?.defaultAlignment || 'justified'
    });
    editorRef.current.innerHTML = cleaned;
    onChange(cleaned);
  };

  // Undo formatting handler
  const handleUndoFormatting = () => {
    if (previousHtml !== null && editorRef.current) {
      editorRef.current.innerHTML = previousHtml;
      onChange(previousHtml);
      setShowUndo(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Hint above editor with Undo option */}
      <div className="flex items-center justify-between p-2.5 px-3.5 rounded-xl bg-accent-tint/40 border border-accent/20 text-xs text-sec">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-accent shrink-0" />
          <span className="font-medium text-main truncate">
            Paste your typed lesson here. The app will fix the formatting.
          </span>
        </div>
        {showUndo && (
          <button
            type="button"
            onClick={handleUndoFormatting}
            className="text-xs text-accent font-semibold hover:underline flex items-center gap-1 cursor-pointer ml-2 shrink-0"
            title="Revert smart formatting"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Undo formatting</span>
          </button>
        )}
      </div>

      {/* Photo Comparison Bar if photos were uploaded */}
      {photos.length > 0 && (
        <div className="p-3 rounded-xl bg-subtle/50 border border-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-main uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-accent" />
              <span>Handwritten Source Photos (Tap to Compare)</span>
            </span>
            <span className="text-[11px] text-mut">{photos.length} {photos.length === 1 ? 'page' : 'pages'}</span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPhoto(p.url)}
                className="relative group shrink-0 w-20 h-24 rounded-lg overflow-hidden border border-subtle hover:border-accent hover:shadow-md transition-all cursor-pointer bg-black/10"
                title={`Page ${idx + 1} - Click to enlarge`}
              >
                <img src={p.url} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Maximize2 className="w-4 h-4" />
                </div>
                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/70 text-white text-[9px] font-bold">
                  #{idx + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Rich Text Editor Container */}
      <div className="rounded-2xl border border-subtle bg-surface shadow-card overflow-hidden">
        {/* Editor Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 bg-subtle/40 border-b border-subtle text-xs select-none">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Inline Formatting */}
            <button
              type="button"
              onClick={() => formatDoc('bold')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('italic')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('underline')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>

            <span className="w-[1px] h-4 bg-subtle mx-1" />

            {/* Alignment */}
            <button
              type="button"
              onClick={() => formatDoc('justifyLeft')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyCenter')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyRight')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => formatDoc('justifyFull')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Justify (Standard Body)"
            >
              <AlignJustify className="w-4 h-4" />
            </button>

            <span className="w-[1px] h-4 bg-subtle mx-1" />

            {/* Lists & Indent */}
            <button
              type="button"
              onClick={() => formatDoc('insertOrderedList')}
              className="p-1.5 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors cursor-pointer"
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleFirstLineIndent}
              className="px-2 py-1 rounded-lg text-sec hover:text-main hover:bg-surface border border-transparent hover:border-subtle transition-colors flex items-center gap-1 font-medium cursor-pointer"
              title="Toggle First-Line Indent"
            >
              <Indent className="w-4 h-4" />
              <span className="text-[11px]">Indent</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Fix Formatting Button */}
            <button
              type="button"
              onClick={handleFixFormatting}
              className="px-2.5 py-1 rounded-lg bg-accent text-accent-contrast hover:opacity-95 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-opacity cursor-pointer"
              title="Fix formatting across the entire lesson"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fix Formatting</span>
            </button>

            {/* Unclear Words Notification */}
            {unclearCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-800">
                  <span>{unclearCount} unclear</span>
                </span>
                <button
                  type="button"
                  onClick={handleClearAllUnclear}
                  className="text-[11px] text-accent font-semibold hover:underline cursor-pointer"
                  title="Mark all unclear words as reviewed"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ContentEditable Editor Body */}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onClick={handleEditorClick}
          onPaste={handlePaste}
          className="p-5 sm:p-7 min-h-[360px] max-h-[600px] overflow-y-auto focus:outline-none text-main leading-relaxed text-sm sm:text-base space-y-2 selection:bg-accent-tint selection:text-accent"
          style={{
            textAlign: (settings?.defaultAlignment === 'justified' ? 'justify' : settings?.defaultAlignment) || 'justify',
            fontFamily: settings?.fontName ? `${settings.fontName}, sans-serif` : 'inherit'
          }}
        />
      </div>

      {/* Lightbox for inspecting handwritten photo */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors cursor-pointer"
              title="Close image"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedPhoto}
              alt="Handwritten page"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
};

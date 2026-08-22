import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { getUsernameColor } from './utils';

export interface RichChatInputHandle {
  focus: () => void;
  insertMention: (username: string, mentionStartIndex: number, queryLength: number) => void;
  clear: () => void;
}

interface RichChatInputProps {
  value: string;
  onChange: (text: string, cursorOffset: number) => void;
  onSend: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
}

/** Normalize nbsp (browsers insert it for trailing spaces) and line endings. */
const normalize = (s: string) =>
  s.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/**
 * Get plain text content and current caret index from a contentEditable.
 *
 * Both values come from Range.toString(). Reading `text` from `innerText`
 * instead would disagree with the Range-derived caret offset, because WebKit's
 * innerText collapses trailing whitespace — so every space typed shifted the
 * caret one character out of sync with the text and dropped trailing spaces
 * from sent messages.
 */
function getPlainTextAndCaretOffset(element: HTMLElement): { text: string; caretOffset: number } {
  let caretOffset = 0;
  const sel = window.getSelection();

  if (sel && sel.rangeCount > 0 && element.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = normalize(preCaretRange.toString()).length;
  }

  const full = document.createRange();
  full.selectNodeContents(element);
  return { text: normalize(full.toString()), caretOffset };
}

function getRangeByOffsets(element: HTMLElement, startOffset: number, endOffset: number): Range | null {
  if (element.childNodes.length === 0 && startOffset === 0 && endOffset === 0) {
    const range = document.createRange();
    range.setStart(element, 0);
    range.setEnd(element, 0);
    return range;
  }

  const range = document.createRange();
  let currentOffset = 0;
  let startFound = false;
  let endFound = false;

  function traverseNodes(node: Node) {
    if (endFound) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent?.length || 0;
      if (!startFound && currentOffset + nodeLength >= startOffset) {
        range.setStart(node, startOffset - currentOffset);
        startFound = true;
      }
      if (startFound && !endFound && currentOffset + nodeLength >= endOffset) {
        range.setEnd(node, endOffset - currentOffset);
        endFound = true;
      }
      currentOffset += nodeLength;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // Treat atomic mention badge as single block
      if (el.getAttribute('data-mention')) {
        const badgeLength = el.textContent?.length || 0;
        if (!startFound && currentOffset + badgeLength >= startOffset) {
          range.setStartBefore(el);
          startFound = true;
        }
        if (startFound && !endFound && currentOffset + badgeLength >= endOffset) {
          range.setEndAfter(el);
          endFound = true;
        }
        currentOffset += badgeLength;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverseNodes(node.childNodes[i]);
          if (endFound) break;
        }
      }
    }
  }

  traverseNodes(element);

  if (startFound && endFound) {
    return range;
  }
  return null;
}

/** Set text caret position within a contentEditable element */
function setCaretPosition(element: HTMLElement, targetOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const range = getRangeByOffsets(element, targetOffset, targetOffset);
  if (range) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export const RichChatInput = forwardRef<RichChatInputHandle, RichChatInputProps>(({
  value,
  onChange,
  onSend,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder = 'Message',
}, ref) => {
  const editableRef = useRef<HTMLDivElement>(null);
  // iOS predictive text / IME runs as a composition, and space is the key that
  // commits an autocorrection. Reporting upward mid-composition let React fight
  // the browser over the DOM. The old <textarea> guarded this; the rewrite lost it.
  const isComposing = useRef(false);
  const [composing, setComposing] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      editableRef.current?.focus();
    },
    clear: () => {
      if (editableRef.current) {
        editableRef.current.innerHTML = '';
      }
    },
    insertMention: (username: string, mentionStartIndex: number, queryLength: number) => {
      const el = editableRef.current;
      if (!el) return;

      const color = getUsernameColor(username);
      // Use inline align-baseline for exact text baseline matching
      const badgeHtml = `<span contenteditable="false" data-mention="${username}" class="font-extrabold uppercase tracking-wider text-[10px] py-0.5 rounded inline align-baseline cursor-default select-none opacity-70" style="color: ${color}; background-color: ${color}15;">@${username}</span>\u00A0`;

      const range = getRangeByOffsets(el, mentionStartIndex, mentionStartIndex + 1 + queryLength);
      let newCaretPos = 0;

      if (range) {
        range.deleteContents();
        const wrapper = document.createElement('span');
        wrapper.innerHTML = badgeHtml;
        const frag = document.createDocumentFragment();
        while (wrapper.firstChild) {
          frag.appendChild(wrapper.firstChild);
        }
        range.insertNode(frag);
        
        newCaretPos = mentionStartIndex + username.length + 2;
      } else {
        // Fallback if range fails
        const { text } = getPlainTextAndCaretOffset(el);
        const textBefore = text.slice(0, mentionStartIndex);
        const textAfter = text.slice(mentionStartIndex + 1 + queryLength);
        el.innerHTML = textBefore + badgeHtml + textAfter;
        newCaretPos = textBefore.length + username.length + 2;
      }

      requestAnimationFrame(() => {
        el.focus();
        setCaretPosition(el, newCaretPos);
      });

      // Same Range-based read as handleInput — innerText here would reintroduce
      // the trailing-space divergence the caret offsets depend on.
      onChange(getPlainTextAndCaretOffset(el).text, newCaretPos);
    },
  }));

  const handleInput = () => {
    const el = editableRef.current;
    if (!el) return;
    if (isComposing.current) return;
    const { text, caretOffset } = getPlainTextAndCaretOffset(el);
    onChange(text, caretOffset);
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
    setComposing(true);
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
    setComposing(false);
    handleInput();
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    // Committing an IME/autocorrect suggestion with Enter must not send.
    if (isComposing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

  };

  return (
    <div className="relative flex-1">
      {value === '' && !composing && (
        <span
          aria-hidden
          className="absolute left-0 top-1 text-16 text-fog/70 leading-snug pointer-events-none select-none"
        >
          {placeholder}
        </span>
      )}
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        // iOS autocorrect rewrites the DOM on space; letting it run inside a
        // contentEditable React does not control causes lost keystrokes.
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        enterKeyHint="send"
        onInput={handleInput}
        onKeyDown={handleKeyDownInternal}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={onFocus}
        onBlur={onBlur}
        // text-16: below 16px iOS Safari auto-zooms the page on focus and never zooms back.
        className="w-full bg-transparent text-16 text-paper/80 focus:outline-none transition-colors duration-150 overflow-y-auto max-h-[120px] py-1 leading-snug wrap-break-word whitespace-pre-wrap"
        style={{ outline: 'none' }}
      />
    </div>
  );
});

RichChatInput.displayName = 'RichChatInput';


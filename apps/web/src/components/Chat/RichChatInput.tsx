import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
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

/** Get plain text content and current text caret index from contentEditable element */
function getPlainTextAndCaretOffset(element: HTMLElement): { text: string; caretOffset: number } {
  let caretOffset = 0;
  const sel = window.getSelection();

  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preCaretRange.toString().length;
  }

  // Convert innerText / textContent and normalize non-breaking spaces (\u00A0) to standard spaces
  const text = element.innerText.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return { text, caretOffset };
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
  const isSelfUpdating = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      editableRef.current?.focus();
    },
    clear: () => {
      if (editableRef.current) {
        isSelfUpdating.current = true;
        editableRef.current.innerHTML = '';
        isSelfUpdating.current = false;
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
        isSelfUpdating.current = true;
        range.deleteContents();
        const wrapper = document.createElement('span');
        wrapper.innerHTML = badgeHtml;
        const frag = document.createDocumentFragment();
        while (wrapper.firstChild) {
          frag.appendChild(wrapper.firstChild);
        }
        range.insertNode(frag);
        isSelfUpdating.current = false;
        
        newCaretPos = mentionStartIndex + username.length + 2;
      } else {
        // Fallback if range fails
        const { text } = getPlainTextAndCaretOffset(el);
        const textBefore = text.slice(0, mentionStartIndex);
        const textAfter = text.slice(mentionStartIndex + 1 + queryLength);
        isSelfUpdating.current = true;
        el.innerHTML = textBefore + badgeHtml + textAfter;
        isSelfUpdating.current = false;
        newCaretPos = textBefore.length + username.length + 2;
      }

      requestAnimationFrame(() => {
        el.focus();
        setCaretPosition(el, newCaretPos);
      });

      onChange(el.innerText.replace(/\u00A0/g, ' '), newCaretPos);
    },
  }));

  // Sync value when cleared externally
  useEffect(() => {
    if (isSelfUpdating.current) return;
    if (value === '' && editableRef.current && editableRef.current.innerHTML !== '') {
      editableRef.current.innerHTML = '';
    }
  }, [value]);

  const handleInput = () => {
    const el = editableRef.current;
    if (!el) return;
    // Browsers can leave a stray <br> behind after deleting all text, which
    // breaks the `:empty` placeholder selector — textContent ignores it, so use
    // it to detect true emptiness and clean up the leftover node.
    if (el.textContent === '' && el.innerHTML !== '') {
      el.innerHTML = '';
    }
    const { text, caretOffset } = getPlainTextAndCaretOffset(el);
    onChange(text, caretOffset);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

  };

  return (
    <div
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={handleInput}
      onKeyDown={handleKeyDownInternal}
      onFocus={onFocus}
      onBlur={onBlur}
      className="flex-1 bg-transparent text-13 text-paper/80 focus:outline-none transition-colors duration-150 overflow-y-auto max-h-[120px] py-1 empty:before:content-[attr(data-placeholder)] empty:before:text-fog/70 leading-snug wrap-break-word whitespace-pre-wrap"
      style={{ outline: 'none' }}
    />
  );
});

RichChatInput.displayName = 'RichChatInput';


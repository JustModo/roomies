export type MessageToken =
  | { type: 'text'; content: string }
  | { type: 'mention'; username: string; rawText: string };

/**
 * Parses a message string into text and mention tokens based on a list of known usernames.
 * Matching is case-insensitive.
 */
export function parseMentions(text: string, knownUsernames: string[]): MessageToken[] {
  if (!text || !knownUsernames || knownUsernames.length === 0) {
    return [{ type: 'text', content: text }];
  }

  // Sort knownUsernames by length descending so longer names match first
  const sortedUsernames = [...knownUsernames].sort((a, b) => b.length - a.length);

  // Escape special regex characters in usernames
  const escapedUsernames = sortedUsernames.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Pattern matches @username (case-insensitive) bounded by word boundary or space/end
  const pattern = new RegExp(`@(${escapedUsernames.join('|')})(?=\\b|\\s|$)`, 'gi');

  const tokens: MessageToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const rawMention = match[0];
    const matchedUsernameStr = match[1];

    const originalUsername =
      knownUsernames.find((u) => u.toLowerCase() === matchedUsernameStr.toLowerCase()) || matchedUsernameStr;

    tokens.push({
      type: 'mention',
      username: originalUsername,
      rawText: rawMention,
    });

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', content: text }];
}

/**
 * Checks if a specific username is pinged/mentioned in the text.
 */
export function isUserPinged(text: string, username?: string | null): boolean {
  if (!text || !username) return false;
  const tokens = parseMentions(text, [username]);
  return tokens.some((t) => t.type === 'mention' && t.username.toLowerCase() === username.toLowerCase());
}

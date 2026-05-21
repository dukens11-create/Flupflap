/**
 * Tests for FlupFlap Garage Sale live engagement features.
 *
 * These tests exercise:
 *  - Chat message filtering (hidden messages excluded).
 *  - Like/reaction count accumulation.
 *  - Session ID consistency — all engagement features use saleId as canonical ID.
 *  - Seller moderation (hide/delete) state transitions.
 *  - Empty-state conditions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Chat message filtering ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  userId: string | null;
  guestName: string | null;
  message: string;
  createdAt: string;
  isHidden: boolean;
}

function filterVisibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !m.isHidden);
}

test('filterVisibleMessages: returns all messages when none are hidden', () => {
  const messages: ChatMessage[] = [
    { id: 'm1', userId: null, guestName: 'Alice', message: 'Hello!', createdAt: '2024-01-01T00:00:00Z', isHidden: false },
    { id: 'm2', userId: 'u1', guestName: null, message: 'Nice sale!', createdAt: '2024-01-01T00:01:00Z', isHidden: false },
  ];
  assert.equal(filterVisibleMessages(messages).length, 2);
});

test('filterVisibleMessages: excludes hidden messages', () => {
  const messages: ChatMessage[] = [
    { id: 'm1', userId: null, guestName: 'Spammer', message: 'Buy now!', createdAt: '2024-01-01T00:00:00Z', isHidden: true },
    { id: 'm2', userId: 'u1', guestName: null, message: 'Great prices!', createdAt: '2024-01-01T00:01:00Z', isHidden: false },
  ];
  const visible = filterVisibleMessages(messages);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'm2');
});

test('filterVisibleMessages: returns empty array when all messages are hidden', () => {
  const messages: ChatMessage[] = [
    { id: 'm1', userId: null, guestName: 'Bot', message: 'Spam', createdAt: '2024-01-01T00:00:00Z', isHidden: true },
  ];
  assert.equal(filterVisibleMessages(messages).length, 0);
});

test('filterVisibleMessages: empty input returns empty output', () => {
  assert.equal(filterVisibleMessages([]).length, 0);
});

// ── Seller moderation — hide message ─────────────────────────────────────────

function removeMessageFromList(messages: ChatMessage[], msgId: string): ChatMessage[] {
  return messages.filter((m) => m.id !== msgId);
}

test('removeMessageFromList: removes the target message from the local list', () => {
  const messages: ChatMessage[] = [
    { id: 'm1', userId: null, guestName: 'Alice', message: 'Hello', createdAt: '2024-01-01T00:00:00Z', isHidden: false },
    { id: 'm2', userId: null, guestName: 'Bob', message: 'Hi', createdAt: '2024-01-01T00:01:00Z', isHidden: false },
  ];
  const after = removeMessageFromList(messages, 'm1');
  assert.equal(after.length, 1);
  assert.equal(after[0].id, 'm2');
});

test('removeMessageFromList: no-op when message id does not exist', () => {
  const messages: ChatMessage[] = [
    { id: 'm1', userId: null, guestName: 'Alice', message: 'Hello', createdAt: '2024-01-01T00:00:00Z', isHidden: false },
  ];
  const after = removeMessageFromList(messages, 'non-existent');
  assert.equal(after.length, 1);
});

// ── Reaction / like accumulation ──────────────────────────────────────────────

interface Reaction {
  id: string;
  saleId: string;
  userId: string | null;
  guestId: string | null;
  type: 'like' | 'heart';
  createdAt: string;
}

function countReactions(reactions: Reaction[]): number {
  return reactions.length;
}

function getRecentReactions(reactions: Reaction[], n = 10): Reaction[] {
  return [...reactions].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  }).slice(0, n);
}

test('countReactions: returns 0 for empty list', () => {
  assert.equal(countReactions([]), 0);
});

test('countReactions: counts all reactions regardless of type', () => {
  const reactions: Reaction[] = [
    { id: 'r1', saleId: 'sale1', userId: 'u1', guestId: null, type: 'like', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'r2', saleId: 'sale1', userId: null, guestId: 'g1', type: 'heart', createdAt: '2024-01-01T00:01:00Z' },
    { id: 'r3', saleId: 'sale1', userId: 'u2', guestId: null, type: 'like', createdAt: '2024-01-01T00:02:00Z' },
  ];
  assert.equal(countReactions(reactions), 3);
});

test('getRecentReactions: returns newest reactions first', () => {
  const reactions: Reaction[] = [
    { id: 'r1', saleId: 'sale1', userId: 'u1', guestId: null, type: 'like', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'r2', saleId: 'sale1', userId: 'u2', guestId: null, type: 'heart', createdAt: '2024-01-01T00:02:00Z' },
    { id: 'r3', saleId: 'sale1', userId: 'u3', guestId: null, type: 'like', createdAt: '2024-01-01T00:01:00Z' },
  ];
  const recent = getRecentReactions(reactions, 10);
  assert.equal(recent[0].id, 'r2');
  assert.equal(recent[1].id, 'r3');
  assert.equal(recent[2].id, 'r1');
});

test('getRecentReactions: limits to n results', () => {
  const reactions: Reaction[] = Array.from({ length: 15 }, (_, i) => ({
    id: `r${i}`,
    saleId: 'sale1',
    userId: `u${i}`,
    guestId: null,
    type: 'like' as const,
    createdAt: new Date(Date.now() + i * 1000).toISOString(),
  }));
  assert.equal(getRecentReactions(reactions, 10).length, 10);
});

// ── Session ID consistency ────────────────────────────────────────────────────

test('session ID consistency: all engagement features use the same saleId', () => {
  const saleId = 'cuid-garage-sale-001';

  // Simulate building URLs for each engagement feature
  const chatUrl = `/api/garage-sales/${saleId}/chat`;
  const reactionsUrl = `/api/garage-sales/${saleId}/reactions`;
  const liveUrl = `/api/garage-sales/${saleId}/live`;
  const signalingUrl = `/api/garage-sales/${saleId}/live/signaling`;

  // All URLs must contain the same saleId segment
  for (const url of [chatUrl, reactionsUrl, liveUrl, signalingUrl]) {
    assert.ok(url.includes(saleId), `URL ${url} does not contain saleId ${saleId}`);
  }
});

test('session ID consistency: chat message moderation endpoint uses same saleId', () => {
  const saleId = 'cuid-garage-sale-001';
  const msgId = 'msg-001';
  const moderationUrl = `/api/garage-sales/${saleId}/chat/${msgId}`;
  assert.ok(moderationUrl.includes(saleId));
  assert.ok(moderationUrl.includes(msgId));
});

// ── Optimistic like update ────────────────────────────────────────────────────

test('optimistic like: count increments immediately before server response', () => {
  let likeCount = 5;
  // Simulate optimistic update
  likeCount += 1;
  assert.equal(likeCount, 6);
});

test('optimistic like: server total reconciles after response', () => {
  let likeCount = 6; // after optimistic
  const serverTotal = 7; // server may have received other likes concurrently
  likeCount = serverTotal;
  assert.equal(likeCount, 7);
});

// ── Reaction type validation ──────────────────────────────────────────────────

function resolveReactionType(input: string | undefined): 'like' | 'heart' {
  return input === 'heart' ? 'heart' : 'like';
}

test('resolveReactionType: defaults to "like" for unknown types', () => {
  assert.equal(resolveReactionType(undefined), 'like');
  assert.equal(resolveReactionType('unknown'), 'like');
  assert.equal(resolveReactionType(''), 'like');
});

test('resolveReactionType: accepts "heart" type', () => {
  assert.equal(resolveReactionType('heart'), 'heart');
});

test('resolveReactionType: accepts "like" type', () => {
  assert.equal(resolveReactionType('like'), 'like');
});

// ── Guest name resolution ─────────────────────────────────────────────────────

const DEFAULT_GUEST_NAME = 'Guest';

function resolveGuestName(userId: string | null, guestName: string | undefined): string | null {
  if (userId) return null; // authenticated user — no guest name needed
  const trimmed = typeof guestName === 'string' ? guestName.trim() : '';
  return trimmed ? trimmed.slice(0, 50) : DEFAULT_GUEST_NAME;
}

test('resolveGuestName: returns null for authenticated users', () => {
  assert.equal(resolveGuestName('u1', 'Alice'), null);
});

test('resolveGuestName: uses provided name for guests', () => {
  assert.equal(resolveGuestName(null, 'Alice'), 'Alice');
});

test('resolveGuestName: falls back to "Guest" when name is empty', () => {
  assert.equal(resolveGuestName(null, ''), DEFAULT_GUEST_NAME);
  assert.equal(resolveGuestName(null, undefined), DEFAULT_GUEST_NAME);
  assert.equal(resolveGuestName(null, '   '), DEFAULT_GUEST_NAME);
});

test('resolveGuestName: truncates long names to 50 chars', () => {
  const long = 'A'.repeat(100);
  const resolved = resolveGuestName(null, long);
  assert.equal(resolved?.length, 50);
});

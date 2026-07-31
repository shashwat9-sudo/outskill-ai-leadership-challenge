import { describe, expect, it } from 'vitest';
import {
  signAttemptToken,
  signParticipantToken,
  verifyAttemptToken,
  verifyParticipantToken,
} from '@/lib/security/tokens';
import { signAdminSession, verifyAdminSession } from '@/lib/auth/admin-session';
import { clientIpFrom, hashIp, safeEqual } from '@/lib/security/hash';
import { isSameOrigin } from '@/lib/security/origin';

const SECRET = 'test-secret-value-that-is-at-least-32-characters-long';
const OTHER_SECRET = 'a-completely-different-secret-value-32-chars-plus';

describe('participant tokens', () => {
  it('round-trips a participant id', async () => {
    const token = await signParticipantToken('participant-1', SECRET);
    const claims = await verifyParticipantToken(token, SECRET);
    expect(claims?.participantId).toBe('participant-1');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signParticipantToken('participant-1', SECRET);
    expect(await verifyParticipantToken(token, OTHER_SECRET)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signParticipantToken('participant-1', SECRET);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ pid: 'someone-else' })).toString('base64url');
    expect(await verifyParticipantToken(`${header}.${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signParticipantToken('participant-1', SECRET, 60, Date.now() - 120_000);
    expect(await verifyParticipantToken(token, SECRET)).toBeNull();
  });

  it('rejects obvious rubbish', async () => {
    expect(await verifyParticipantToken('not-a-token', SECRET)).toBeNull();
    expect(await verifyParticipantToken('', SECRET)).toBeNull();
  });

  it('rejects an attempt token presented as a participant token', async () => {
    const attemptToken = await signAttemptToken(
      { attemptId: 'a1', participantId: 'p1', deadlineAtMs: Date.now() + 60_000 },
      SECRET,
    );
    expect(await verifyParticipantToken(attemptToken, SECRET)).toBeNull();
  });
});

describe('attempt tokens', () => {
  const deadlineAtMs = Date.UTC(2026, 7, 6, 12, 0, 0);

  it('round-trips the attempt, participant and deadline', async () => {
    const token = await signAttemptToken({ attemptId: 'a1', participantId: 'p1', deadlineAtMs }, SECRET);
    const claims = await verifyAttemptToken(token, SECRET);

    expect(claims?.attemptId).toBe('a1');
    expect(claims?.participantId).toBe('p1');
    expect(claims?.deadlineAt).toBe(deadlineAtMs);
  });

  it('never carries an answer key', async () => {
    const token = await signAttemptToken({ attemptId: 'a1', participantId: 'p1', deadlineAtMs }, SECRET);
    const payload = Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8');

    expect(payload).not.toContain('correct');
    expect(payload).not.toContain('answer');
    expect(payload).not.toContain('score');
    expect(Object.keys(JSON.parse(payload)).sort()).toEqual(['aid', 'aud', 'dl', 'exp', 'iat', 'iss', 'pid']);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAttemptToken({ attemptId: 'a1', participantId: 'p1', deadlineAtMs }, SECRET);
    expect(await verifyAttemptToken(token, OTHER_SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signAttemptToken(
      { attemptId: 'a1', participantId: 'p1', deadlineAtMs },
      SECRET,
      60,
      Date.now() - 600_000,
    );
    expect(await verifyAttemptToken(token, SECRET)).toBeNull();
  });

  it('rejects a participant token presented as an attempt token', async () => {
    const participantToken = await signParticipantToken('p1', SECRET);
    expect(await verifyAttemptToken(participantToken, SECRET)).toBeNull();
  });

  it('rejects an admin session presented as an attempt token', async () => {
    const adminToken = await signAdminSession('sess1', SECRET);
    expect(await verifyAttemptToken(adminToken, SECRET)).toBeNull();
  });
});

describe('admin session', () => {
  it('round-trips a session id', async () => {
    const token = await signAdminSession('sess-abc', SECRET);
    const session = await verifyAdminSession(token, SECRET);
    expect(session?.sessionId).toBe('sess-abc');
  });

  it('rejects a session signed with a different secret, so rotating the secret logs everyone out', async () => {
    const token = await signAdminSession('sess-abc', SECRET);
    expect(await verifyAdminSession(token, OTHER_SECRET)).toBeNull();
  });

  it('rejects an expired session', async () => {
    const token = await signAdminSession('sess-abc', SECRET, 3600, Date.now() - 8 * 3600 * 1000);
    expect(await verifyAdminSession(token, SECRET)).toBeNull();
  });

  it('rejects an empty or malformed cookie value', async () => {
    expect(await verifyAdminSession('', SECRET)).toBeNull();
    expect(await verifyAdminSession('a.b.c', SECRET)).toBeNull();
  });

  it('carries no privilege information beyond the session id', async () => {
    const token = await signAdminSession('sess-abc', SECRET);
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid']);
  });
});

describe('IP hashing', () => {
  it('is deterministic for the same address and secret', () => {
    expect(hashIp('203.0.113.5', SECRET)).toBe(hashIp('203.0.113.5', SECRET));
  });

  it('differs between addresses', () => {
    expect(hashIp('203.0.113.5', SECRET)).not.toBe(hashIp('203.0.113.6', SECRET));
  });

  it('differs between secrets, so a leaked table is not reversible without the key', () => {
    expect(hashIp('203.0.113.5', SECRET)).not.toBe(hashIp('203.0.113.5', OTHER_SECRET));
  });

  it('never contains the original address', () => {
    expect(hashIp('203.0.113.5', SECRET)).not.toContain('203.0.113.5');
  });

  it('reads the first hop from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' });
    expect(clientIpFrom(headers)).toBe('203.0.113.5');
  });

  it('falls back through the other proxy headers', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(clientIpFrom(new Headers({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('returns a placeholder rather than throwing when no header is present', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});

describe('constant-time comparison', () => {
  it('accepts an exact match', () => {
    expect(safeEqual('correct-horse-battery', 'correct-horse-battery')).toBe(true);
  });

  it('rejects a different value of the same length', () => {
    expect(safeEqual('abcdefgh', 'abcdefgi')).toBe(false);
  });

  it('rejects values of different lengths without throwing', () => {
    expect(safeEqual('short', 'considerably-longer')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('origin checks', () => {
  const appUrl = 'https://challenge.example.com';

  function request(headers: Record<string, string>): Request {
    return new Request('https://challenge.example.com/api/admin/settings', { method: 'POST', headers });
  }

  it('accepts a request from our own origin', () => {
    expect(isSameOrigin(request({ origin: appUrl }), appUrl)).toBe(true);
  });

  it('accepts a request matching the Host header', () => {
    expect(
      isSameOrigin(request({ origin: 'https://other.example.com', host: 'other.example.com' }), appUrl),
    ).toBe(true);
  });

  it('rejects a cross-site origin', () => {
    expect(isSameOrigin(request({ origin: 'https://evil.example.com' }), appUrl)).toBe(false);
  });

  it('rejects a request with no Origin header at all', () => {
    expect(isSameOrigin(request({}), appUrl)).toBe(false);
  });

  it('does not fall open when the configured app URL is unparseable', () => {
    expect(isSameOrigin(request({ origin: 'https://evil.example.com' }), 'not a url')).toBe(false);
  });
});

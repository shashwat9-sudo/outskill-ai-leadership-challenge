import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { ATTEMPT_TOKEN_TTL_SECONDS, PARTICIPANT_TOKEN_TTL_SECONDS } from '@/lib/config/constants';

/**
 * Short-lived signed tokens for the participant journey.
 *
 * The secret is passed in rather than read from the environment so this module stays pure and unit
 * testable, and so a caller can never accidentally sign with the wrong key silently.
 *
 * A token NEVER carries correct answers, scores or ranks. It carries identity and timing only; every
 * fact that matters is re-read from the database on submit.
 */

const ISSUER = 'outskill-ai-leadership-challenge';
const PARTICIPANT_AUDIENCE = 'participant';
const ATTEMPT_AUDIENCE = 'attempt';
const ALGORITHM = 'HS256';

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export type ParticipantTokenClaims = {
  participantId: string;
  issuedAt: number;
  expiresAt: number;
};

export type AttemptTokenClaims = {
  attemptId: string;
  participantId: string;
  issuedAt: number;
  /** Visible deadline of the run, as epoch milliseconds. Authoritative copy lives in the database. */
  deadlineAt: number;
  expiresAt: number;
};

export async function signParticipantToken(
  participantId: string,
  secret: string,
  ttlSeconds: number = PARTICIPANT_TOKEN_TTL_SECONDS,
  nowMs: number = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  return new SignJWT({ pid: participantId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(PARTICIPANT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(keyFrom(secret));
}

export async function verifyParticipantToken(
  token: string,
  secret: string,
): Promise<ParticipantTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: ISSUER,
      audience: PARTICIPANT_AUDIENCE,
      algorithms: [ALGORITHM],
    });
    const participantId = readString(payload, 'pid');
    if (!participantId || !payload.iat || !payload.exp) return null;
    return { participantId, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export async function signAttemptToken(
  input: { attemptId: string; participantId: string; deadlineAtMs: number },
  secret: string,
  ttlSeconds: number = ATTEMPT_TOKEN_TTL_SECONDS,
  nowMs: number = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(nowMs / 1000);
  return new SignJWT({ aid: input.attemptId, pid: input.participantId, dl: input.deadlineAtMs })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(ATTEMPT_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(keyFrom(secret));
}

export async function verifyAttemptToken(token: string, secret: string): Promise<AttemptTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: ISSUER,
      audience: ATTEMPT_AUDIENCE,
      algorithms: [ALGORITHM],
    });
    const attemptId = readString(payload, 'aid');
    const participantId = readString(payload, 'pid');
    const deadlineAt = readNumber(payload, 'dl');
    if (!attemptId || !participantId || deadlineAt === null || !payload.iat || !payload.exp) return null;
    return { attemptId, participantId, deadlineAt, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

function readString(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(payload: JWTPayload, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

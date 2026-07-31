'use client';

import { ATTEMPT_STORAGE_KEY, PARTICIPANT_STORAGE_KEY, RESULT_STORAGE_KEY, type OptionId } from '@/lib/config/constants';
import type { ChallengeQuestion, SubmitResponse } from '@/lib/client/api';

/**
 * Attempt state persisted across a refresh.
 *
 * sessionStorage, not localStorage: a booth tablet must not carry one visitor's run into the next
 * visitor's session, and closing the tab is the natural end of an attempt. The finished *result* is a
 * different case — on a personal phone that is kept in localStorage so the visitor can show it later.
 */

export type StoredAttempt = {
  attemptToken: string;
  deadlineAtMs: number;
  startedAtMs: number;
  /** Offset between the browser clock and the server clock, so a wrong device clock cannot help. */
  clockOffsetMs: number;
  questions: ChallengeQuestion[];
  answers: Record<string, { selected: OptionId | null; offsetMs: number }>;
  index: number;
  /** Stable id so a retry after a dropped connection is recognisably the same submission. */
  clientSubmissionId: string;
};

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or partially-written state is worse than no state; drop it and start clean.
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota. The run continues in memory; only refresh-recovery is lost.
  }
}

export const attemptStorage = {
  read(): StoredAttempt | null {
    if (typeof window === 'undefined') return null;
    return readJson<StoredAttempt>(window.sessionStorage, ATTEMPT_STORAGE_KEY);
  },
  write(value: StoredAttempt): void {
    if (typeof window === 'undefined') return;
    writeJson(window.sessionStorage, ATTEMPT_STORAGE_KEY, value);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
  },
};

export const participantStorage = {
  read(): { token: string; questionsPerAttempt: number; durationSeconds: number } | null {
    if (typeof window === 'undefined') return null;
    return readJson(window.sessionStorage, PARTICIPANT_STORAGE_KEY);
  },
  write(value: { token: string; questionsPerAttempt: number; durationSeconds: number }): void {
    if (typeof window === 'undefined') return;
    writeJson(window.sessionStorage, PARTICIPANT_STORAGE_KEY, value);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(PARTICIPANT_STORAGE_KEY);
  },
};

export const resultStorage = {
  read(): SubmitResponse | null {
    if (typeof window === 'undefined') return null;
    return readJson<SubmitResponse>(window.localStorage, RESULT_STORAGE_KEY);
  },
  write(value: SubmitResponse): void {
    if (typeof window === 'undefined') return;
    writeJson(window.localStorage, RESULT_STORAGE_KEY, value);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(RESULT_STORAGE_KEY);
  },
};

/** Wipe every trace of a visitor from a shared booth tablet. */
export function clearParticipantSession(): void {
  attemptStorage.clear();
  participantStorage.clear();
  resultStorage.clear();
}

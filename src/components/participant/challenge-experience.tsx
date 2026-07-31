'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2, RotateCcw, ShieldCheck, Timer } from 'lucide-react';
import {
  apiFetch,
  type ChallengeQuestion,
  type RegisterResponse,
  type ResumeResponse,
  type StartResponse,
  type SubmitResponse,
  type SubmittedAnswerPayload,
} from '@/lib/client/api';
import { attemptStorage, clearParticipantSession, participantStorage, resultStorage } from '@/lib/client/attempt-storage';
import { SUBMIT_RETRY_DELAYS_MS } from '@/lib/config/constants';
import type { OptionId } from '@/lib/config/constants';
import { Button, Eyebrow } from '@/components/ui/primitives';
import { ConnectionPill, useOnlineState, type ConnectionState } from '@/components/participant/connection-status';
import { QuestionRunner } from '@/components/participant/question-runner';
import { RegistrationForm } from '@/components/participant/registration-form';
import { ResultPanel } from '@/components/participant/result-panel';

/**
 * The participant state machine.
 *
 * register → instructions → running → submitting → result
 *
 * Design decisions worth knowing:
 *  - answers live here and in sessionStorage, never on the server until the single final submit
 *  - the countdown is driven by the SERVER deadline plus a measured clock offset, so a tablet with a
 *    wrong clock gains nothing
 *  - submission retries with backoff and is idempotent server-side, so a dropped Wi-Fi link during
 *    the last second cannot lose a run or create two
 */

type Phase = 'register' | 'instructions' | 'running' | 'submitting' | 'result' | 'error';

const TICK_MS = 200;

export type ChallengeExperienceProps = {
  kiosk: boolean;
  autoResetSeconds: number;
  quizState: 'active' | 'paused' | 'locked';
  durationSeconds: number;
  questionsPerAttempt: number;
};

export function ChallengeExperience(props: ChallengeExperienceProps) {
  const [phase, setPhase] = useState<Phase>('register');
  const [participantToken, setParticipantToken] = useState<string | null>(null);

  const [attemptToken, setAttemptToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ChallengeQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selected: OptionId | null; offsetMs: number }>>({});

  const [deadlineAtMs, setDeadlineAtMs] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [result, setResult] = useState<SubmitResponse | null>(null);
  /** When the result screen appeared, which anchors the kiosk reset countdown. */
  const [resultShownAtMs, setResultShownAtMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [starting, setStarting] = useState(false);

  const online = useOnlineState();
  const [requestsFailing, setRequestsFailing] = useState(false);

  // Guards against a second submission from a race between the timer and the last answer.
  const submissionStarted = useRef(false);
  const clientSubmissionId = useRef<string>('');

  const connection: ConnectionState = !online ? 'offline' : requestsFailing ? 'unstable' : 'online';

  const totalMs = props.durationSeconds * 1000;
  const serverNow = now + clockOffsetMs;
  const remainingMs = Math.max(0, deadlineAtMs - serverNow);

  /**
   * Seconds left in the kiosk result window, derived rather than stored so that nothing a participant
   * does on the result screen — including switching between the score and the answer review — can
   * restart it. Null on a personal device, where the tablet never has to be handed on.
   */
  const resetSeconds =
    props.kiosk && phase === 'result' && resultShownAtMs !== null
      ? Math.max(0, props.autoResetSeconds - Math.floor((now - resultShownAtMs) / 1000))
      : null;

  /* ---------------------------------------------------------------------------------------- */
  /* Restore an interrupted run                                                                 */
  /* ---------------------------------------------------------------------------------------- */

  /**
   * Ask the server what it believes about a restored attempt.
   *
   * Three things can only be settled server-side: whether the run already finished (a submission
   * that succeeded just as the tablet died), the real deadline, and the real question set. A failure
   * here is silent on purpose — it means the device is offline, and the locally restored state is
   * still the best available answer.
   */
  const reconcileWithServer = useCallback(
    async (token: string, isCancelled: () => boolean) => {
      const response = await apiFetch<ResumeResponse>(
        `/api/public/resume?attempt_token=${encodeURIComponent(token)}`,
      );
      if (!response.ok || isCancelled()) return;

      if (response.data.state === 'completed') {
        const { state: _state, ...completed } = response.data;
        setResult(completed);
        attemptStorage.clear();
        participantStorage.clear();
        if (!props.kiosk) resultStorage.write(completed);
        submissionStarted.current = true;
        setResultShownAtMs(Date.now());
        setPhase('result');
        return;
      }

      setQuestions(response.data.questions);
      setDeadlineAtMs(Date.parse(response.data.deadline_at));
      setStartedAtMs(Date.parse(response.data.started_at));
      setClockOffsetMs(Date.parse(response.data.server_now) - Date.now());
    },
    [props.kiosk],
  );

  useEffect(() => {
    // A kiosk tablet always starts clean; a personal device may have a result worth showing again.
    if (props.kiosk) {
      clearParticipantSession();
      return;
    }

    let cancelled = false;

    // Restoration is deferred to a microtask on purpose. sessionStorage does not exist during the
    // server render, so restoring synchronously would make the first client render disagree with the
    // server's markup and trigger a hydration mismatch. Restoring immediately after mount is
    // imperceptible and keeps hydration clean.
    void Promise.resolve().then(() => {
      if (cancelled) return;

      const stored = attemptStorage.read();
      if (stored && stored.deadlineAtMs + 60_000 > Date.now()) {
        // Restore from the device first so a reload works even with no connection, then reconcile
        // against the server — which owns the deadline and knows if the run already finished.
        setAttemptToken(stored.attemptToken);
        setQuestions(stored.questions);
        setAnswers(stored.answers);
        setIndex(stored.index);
        setDeadlineAtMs(stored.deadlineAtMs);
        setStartedAtMs(stored.startedAtMs);
        setClockOffsetMs(stored.clockOffsetMs);
        clientSubmissionId.current = stored.clientSubmissionId;
        setPhase('running');
        void reconcileWithServer(stored.attemptToken, () => cancelled);
        return;
      }

      const savedResult = resultStorage.read();
      if (savedResult) {
        setResult(savedResult);
        setResultShownAtMs(Date.now());
        setPhase('result');
        return;
      }

      const participant = participantStorage.read();
      if (participant) {
        setParticipantToken(participant.token);
        setPhase('instructions');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [props.kiosk, reconcileWithServer]);

  /* ---------------------------------------------------------------------------------------- */
  /* Clock                                                                                      */
  /* ---------------------------------------------------------------------------------------- */

  // The same ticker drives the challenge countdown and the kiosk result-window countdown.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'result') return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  /* ---------------------------------------------------------------------------------------- */
  /* Persist in-flight state so a refresh resumes rather than restarts                           */
  /* ---------------------------------------------------------------------------------------- */

  useEffect(() => {
    if (phase !== 'running' || !attemptToken) return;
    attemptStorage.write({
      attemptToken,
      deadlineAtMs,
      startedAtMs,
      clockOffsetMs,
      questions,
      answers,
      index,
      clientSubmissionId: clientSubmissionId.current,
    });
  }, [phase, attemptToken, deadlineAtMs, startedAtMs, clockOffsetMs, questions, answers, index]);

  /* ---------------------------------------------------------------------------------------- */
  /* Submission                                                                                 */
  /* ---------------------------------------------------------------------------------------- */

  const submit = useCallback(
    async (finalAnswers: Record<string, { selected: OptionId | null; offsetMs: number }>, token: string) => {
      setPhase('submitting');
      setSubmitFailed(false);

      const payload: SubmittedAnswerPayload[] = questions.map((question) => ({
        question_id: question.question_id,
        selected_option_id: finalAnswers[question.question_id]?.selected ?? null,
        answered_offset_ms: finalAnswers[question.question_id]?.offsetMs ?? null,
      }));

      // Retry with backoff. The server is idempotent for an already-finalised attempt, so a retry
      // that arrives after a successful-but-unseen first attempt returns the same stored result.
      for (let attempt = 0; attempt <= SUBMIT_RETRY_DELAYS_MS.length; attempt += 1) {
        const response = await apiFetch<SubmitResponse>('/api/public/submit', {
          method: 'POST',
          body: JSON.stringify({
            attempt_token: token,
            answers: payload,
            client_submission_id: clientSubmissionId.current,
          }),
        });

        if (response.ok) {
          setRequestsFailing(false);
          setResult(response.data);
          attemptStorage.clear();
          participantStorage.clear();
          if (!props.kiosk) resultStorage.write(response.data);
          setResultShownAtMs(Date.now());
          setPhase('result');
          return;
        }

        // A rejection the server will keep rejecting — retrying only wastes the visitor's time.
        const permanent = response.error.status >= 400 && response.error.status < 500 && response.error.status !== 429;
        if (permanent) {
          setErrorMessage(response.error.message);
          setSubmitFailed(true);
          setPhase('error');
          return;
        }

        setRequestsFailing(true);
        const delay = SUBMIT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }

      setErrorMessage(
        'We could not send your answers yet. They are still saved on this device — try again, or ask the Outskill team for help.',
      );
      setSubmitFailed(true);
      setPhase('error');
    },
    [questions, props.kiosk],
  );

  const finish = useCallback(
    (finalAnswers: Record<string, { selected: OptionId | null; offsetMs: number }>) => {
      if (submissionStarted.current || !attemptToken) return;
      submissionStarted.current = true;
      void submit(finalAnswers, attemptToken);
    },
    [attemptToken, submit],
  );

  /* ---------------------------------------------------------------------------------------- */
  /* Auto-submit when the clock reaches zero                                                    */
  /* ---------------------------------------------------------------------------------------- */

  useEffect(() => {
    if (phase !== 'running') return;
    if (remainingMs > 0) return;
    finish(answers);
  }, [phase, remainingMs, answers, finish]);

  /* ---------------------------------------------------------------------------------------- */
  /* Kiosk idle reset on the result screen                                                      */
  /* ---------------------------------------------------------------------------------------- */

  const reset = useCallback(() => {
    clearParticipantSession();
    // `replace`, not `href`: the result screen is dropped from history, so the next participant
    // cannot reach the previous one's answers with the browser back gesture.
    window.location.replace(props.kiosk ? '/?kiosk=1' : '/');
  }, [props.kiosk]);

  /**
   * The kiosk result window.
   *
   * A fixed countdown rather than an idle timer: booth staff and the person in the queue both need to
   * know exactly when the tablet frees up, and a participant scrolling the answer review must not be
   * able to hold a tablet open indefinitely. It is derived from the shared clock tick and from when
   * the result arrived, so switching between the summary and review tabs inside ResultPanel cannot
   * restart, pause or otherwise touch it.
   */
  useEffect(() => {
    if (!props.kiosk || phase !== 'result' || resetSeconds === null || resetSeconds > 0) return;
    reset();
  }, [props.kiosk, phase, resetSeconds, reset]);

  /**
   * Back-button and bfcache protection.
   *
   * Safari and Chrome can restore a whole page — React state included — from the back/forward cache.
   * Without this, a back gesture on a booth tablet could put the previous participant's result and
   * answer review back on screen. A restored page is therefore always reloaded from scratch, which
   * lands on the registration screen because the session storage behind it has already been cleared.
   */
  useEffect(() => {
    if (!props.kiosk) return;

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [props.kiosk]);

  /* ---------------------------------------------------------------------------------------- */
  /* Handlers                                                                                   */
  /* ---------------------------------------------------------------------------------------- */

  function handleRegistered(response: RegisterResponse) {
    setParticipantToken(response.participant_token);
    participantStorage.write({
      token: response.participant_token,
      questionsPerAttempt: response.questions_per_attempt,
      durationSeconds: response.quiz_duration_seconds,
    });
    setPhase('instructions');
  }

  async function handleStart() {
    if (!participantToken || starting) return;
    setStarting(true);
    setErrorMessage(null);

    const requestSentAt = Date.now();
    const response = await apiFetch<StartResponse>('/api/public/start', {
      method: 'POST',
      body: JSON.stringify({ participant_token: participantToken }),
    });
    setStarting(false);

    if (!response.ok) {
      setErrorMessage(response.error.message);
      setPhase('error');
      return;
    }

    // Measure the browser-to-server clock difference once, allowing for half the round trip.
    const roundTripMs = Date.now() - requestSentAt;
    const offset = Date.parse(response.data.server_now) + roundTripMs / 2 - Date.now();

    clientSubmissionId.current = crypto.randomUUID();
    setAttemptToken(response.data.attempt_token);
    setQuestions(response.data.questions);
    setDeadlineAtMs(Date.parse(response.data.deadline_at));
    setStartedAtMs(Date.parse(response.data.started_at));
    setClockOffsetMs(offset);
    setIndex(0);
    setAnswers({});
    setNow(Date.now());
    submissionStarted.current = false;
    setPhase('running');
  }

  function handleAnswer(questionId: string, optionId: OptionId) {
    const offsetMs = Math.max(0, Math.round(Date.now() + clockOffsetMs - startedAtMs));
    const next = { ...answers, [questionId]: { selected: optionId, offsetMs } };
    setAnswers(next);

    if (index + 1 >= questions.length) {
      finish(next);
      return;
    }
    setIndex(index + 1);
  }

  function retrySubmission() {
    if (!attemptToken) return;
    submissionStarted.current = true;
    void submit(answers, attemptToken);
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Render                                                                                     */
  /* ---------------------------------------------------------------------------------------- */

  const currentQuestion = questions[index];

  const quizUnavailable = useMemo(() => props.quizState !== 'active', [props.quizState]);

  if (quizUnavailable && phase !== 'result') {
    return (
      <Notice
        tone="warning"
        title={props.quizState === 'locked' ? 'The challenge is closed' : 'The challenge is paused'}
        body={
          props.quizState === 'locked'
            ? 'Thank you for visiting the Outskill booth. The winner is announced at the end of Day 2.'
            : 'The challenge is paused for a moment. Please ask the Outskill team when it reopens.'
        }
      />
    );
  }

  if (phase === 'register') {
    return (
      <div className="mx-auto w-full max-w-xl">
        <RegistrationForm onRegistered={handleRegistered} />
      </div>
    );
  }

  if (phase === 'instructions') {
    return (
      <div className="animate-fade-up mx-auto w-full max-w-xl">
        <Eyebrow>Step 2 of 2</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Before you start</h1>

        <ul className="mt-8 space-y-4">
          <InstructionItem icon={Timer}>
            Answer {props.questionsPerAttempt} workplace AI decisions in {props.durationSeconds} seconds.
          </InstructionItem>
          <InstructionItem icon={ShieldCheck}>Accuracy determines your score. Speed breaks a tie.</InstructionItem>
          <InstructionItem icon={AlertTriangle}>
            Once you select an answer, you cannot return to the previous question.
          </InstructionItem>
        </ul>

        {errorMessage ? (
          <p role="alert" className="mt-6 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {errorMessage}
          </p>
        ) : null}

        <Button size="xl" onClick={handleStart} disabled={starting} className="mt-9 w-full sm:w-auto">
          {starting ? (
            <>
              <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              Start Challenge
              <ArrowRight aria-hidden className="h-5 w-5" />
            </>
          )}
        </Button>

        <p className="mt-4 text-xs text-[var(--color-ink-faint)]">
          The timer starts the moment you press this button.
        </p>
      </div>
    );
  }

  if (phase === 'running' && currentQuestion) {
    return (
      <div className="w-full">
        <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end">
          <ConnectionPill state={connection} />
        </div>
        <QuestionRunner
          key={currentQuestion.question_id}
          question={currentQuestion}
          index={index}
          total={questions.length}
          remainingMs={remainingMs}
          totalMs={totalMs}
          connection={connection}
          onAnswer={handleAnswer}
        />
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 py-16 text-center" role="status" aria-live="polite">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-[var(--color-accent)]" />
        <p className="text-lg text-[var(--color-ink-muted)]">
          {connection === 'online' ? 'Submitting your answers…' : 'Waiting for the connection to return…'}
        </p>
        <p className="max-w-sm text-sm text-[var(--color-ink-faint)]">
          Your answers are saved on this device. Please keep this screen open.
        </p>
      </div>
    );
  }

  if (phase === 'result' && result) {
    return (
      <ResultPanel
        result={result}
        kiosk={props.kiosk}
        autoResetSeconds={props.autoResetSeconds}
        secondsRemaining={resetSeconds}
        onReset={reset}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md text-center">
      <Notice
        tone="danger"
        title={submitFailed ? 'We could not submit your answers' : 'Something went wrong'}
        body={errorMessage ?? 'Please try again, or speak to the Outskill team.'}
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {submitFailed && attemptToken ? (
          <Button size="lg" onClick={retrySubmission}>
            <RotateCcw aria-hidden className="h-4 w-4" />
            Try submitting again
          </Button>
        ) : null}
        <Link href="/">
          <Button variant="secondary" size="lg" className="w-full sm:w-auto">
            Back to start
          </Button>
        </Link>
      </div>
    </div>
  );
}

function InstructionItem({ icon: Icon, children }: { icon: typeof Timer; children: React.ReactNode }) {
  return (
    <li className="surface flex items-start gap-4 px-5 py-4">
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
      <span className="text-[0.98rem] leading-relaxed text-[var(--color-ink)]">{children}</span>
    </li>
  );
}

function Notice({ tone, title, body }: { tone: 'warning' | 'danger'; title: string; body: string }) {
  const colour = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-[var(--radius-lg)] border p-7 text-center"
      style={{
        borderColor: `color-mix(in oklab, ${colour} 40%, transparent)`,
        background: `color-mix(in oklab, ${colour} 8%, transparent)`,
      }}
    >
      <p className="text-lg font-semibold" style={{ color: colour }}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
    </div>
  );
}

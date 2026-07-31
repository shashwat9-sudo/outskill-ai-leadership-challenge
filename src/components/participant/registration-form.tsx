'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { apiFetch, type RegisterResponse } from '@/lib/client/api';
import { Button, Eyebrow } from '@/components/ui/primitives';

/**
 * Registration.
 *
 * Five fields — name, email, phone and company are required; designation is optional. Nothing more:
 * no address, no password. Company and designation are the lead fields Outskill follows up on; they
 * are shown in the admin screens and the CSV export, and never on the leaderboard or the LED display.
 *
 * Registering does not start the timer. That happens on the next screen.
 */

/** Country dialling options offered at the booth. India is the default; the list stays short by design. */
const COUNTRIES = [
  { code: 'IN', label: 'India', dial: '+91' },
  { code: 'AE', label: 'UAE', dial: '+971' },
  { code: 'SG', label: 'Singapore', dial: '+65' },
  { code: 'GB', label: 'UK', dial: '+44' },
  { code: 'US', label: 'USA / Canada', dial: '+1' },
  { code: 'AU', label: 'Australia', dial: '+61' },
] as const;

export type RegistrationFormProps = {
  onRegistered: (result: RegisterResponse) => void;
};

export function RegistrationForm({ onRegistered }: RegistrationFormProps) {
  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();
  const countryId = useId();
  const companyId = useId();
  const designationId = useId();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<string>('IN');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [publicOptIn, setPublicOptIn] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setFieldErrors({});

    // Checked here as well as on the server so a mistyped lead field is flagged instantly at the
    // booth, without a round trip. The server remains the authority — these mirror `registerSchema`.
    const localErrors: Record<string, string> = {};
    const trimmedCompany = companyName.trim();
    const trimmedDesignation = designation.trim();

    if (trimmedCompany.length < 2) {
      localErrors.company_name = 'Please enter your company or organisation.';
    } else if (trimmedCompany.length > 120) {
      localErrors.company_name = 'That company name is too long.';
    }

    // Optional: blank is fine. Only a value that was actually typed is length-checked.
    if (trimmedDesignation.length === 1) {
      localErrors.designation = 'Please enter at least two characters, or leave this blank.';
    } else if (trimmedDesignation.length > 100) {
      localErrors.designation = 'That designation is too long.';
    }

    if (!acceptedRules) {
      localErrors.accepted_rules = 'Please accept the challenge rules and privacy notice.';
    }

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setSubmitting(true);
    const result = await apiFetch<RegisterResponse>('/api/public/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: fullName,
        email,
        phone,
        phone_country: country,
        company_name: trimmedCompany,
        designation: trimmedDesignation.length > 0 ? trimmedDesignation : null,
        public_leaderboard_opt_in: publicOptIn,
        marketing_opt_in: marketingOptIn,
        accepted_rules: acceptedRules,
      }),
    });
    setSubmitting(false);

    if (result.ok) {
      onRegistered(result.data);
      return;
    }

    setFieldErrors(result.error.fields ?? {});
    setFormError(result.error.fields ? null : result.error.message);
  }

  const dial = COUNTRIES.find((entry) => entry.code === country)?.dial ?? '+91';

  return (
    <form onSubmit={handleSubmit} noValidate className="animate-fade-up">
      <Eyebrow>Step 1 of 2</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Enter the challenge</h1>
      <p className="mt-3 max-w-lg text-[var(--color-ink-muted)]">
        A few quick details. The timer does not start yet.
      </p>

      <div className="mt-8 space-y-5">
        <Field id={nameId} label="Full name" error={fieldErrors.full_name}>
          <input
            id={nameId}
            name="full_name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={inputClass(Boolean(fieldErrors.full_name))}
            placeholder="Ananya Sharma"
            aria-invalid={Boolean(fieldErrors.full_name)}
          />
        </Field>

        <Field id={emailId} label="Work email" error={fieldErrors.email}>
          <input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass(Boolean(fieldErrors.email))}
            placeholder="ananya@company.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>

        <Field id={phoneId} label="Mobile number" error={fieldErrors.phone}>
          <div className="flex gap-2">
            <div className="relative">
              <label htmlFor={countryId} className="sr-only">
                Country code
              </label>
              <select
                id={countryId}
                name="phone_country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-full min-h-[3.25rem] rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] px-3 pr-8 text-base text-[var(--color-ink)] transition-colors focus:border-[var(--color-accent)]"
              >
                {COUNTRIES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.dial} {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              id={phoneId}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={`${inputClass(Boolean(fieldErrors.phone))} flex-1`}
              placeholder="98765 43210"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--color-ink-faint)]">
            Currently sending to {dial}. Numbers from other countries are welcome — pick the code above.
          </p>
        </Field>

        <Field id={companyId} label="Company / Organisation" error={fieldErrors.company_name}>
          <input
            id={companyId}
            name="company_name"
            type="text"
            autoComplete="organization"
            required
            maxLength={120}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className={inputClass(Boolean(fieldErrors.company_name))}
            placeholder="Northwind Analytics"
            aria-invalid={Boolean(fieldErrors.company_name)}
          />
        </Field>

        <Field id={designationId} label="Designation / Job Title" optional error={fieldErrors.designation}>
          <input
            id={designationId}
            name="designation"
            type="text"
            autoComplete="organization-title"
            maxLength={100}
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            className={inputClass(Boolean(fieldErrors.designation))}
            placeholder="Head of People"
            aria-invalid={Boolean(fieldErrors.designation)}
          />
        </Field>
      </div>

      <div className="mt-8 space-y-3">
        <Checkbox checked={publicOptIn} onChange={setPublicOptIn} name="public_leaderboard_opt_in">
          Display my name on the public leaderboard
          <span className="mt-0.5 block text-xs text-[var(--color-ink-faint)]">
            We show your first name and surname initial only. Leave this unticked to appear anonymously.
          </span>
        </Checkbox>

        <Checkbox checked={marketingOptIn} onChange={setMarketingOptIn} name="marketing_opt_in">
          I would like to receive useful AI resources and event follow-up from Outskill
        </Checkbox>

        <Checkbox
          checked={acceptedRules}
          onChange={setAcceptedRules}
          name="accepted_rules"
          required
          error={fieldErrors.accepted_rules}
        >
          I agree to the{' '}
          <Link href="/rules" target="_blank" className="text-[var(--color-accent)] underline underline-offset-4">
            challenge rules
          </Link>{' '}
          and{' '}
          <Link href="/privacy" target="_blank" className="text-[var(--color-accent)] underline underline-offset-4">
            privacy notice
          </Link>
        </Checkbox>
      </div>

      {formError ? (
        <p role="alert" className="mt-6 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="xl" disabled={submitting} className="mt-8 w-full sm:w-auto">
        {submitting ? (
          <>
            <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
            Registering…
          </>
        ) : (
          <>
            Continue
            <ArrowRight aria-hidden className="h-5 w-5" />
          </>
        )}
      </Button>
    </form>
  );
}

function inputClass(hasError: boolean): string {
  return [
    'w-full min-h-[3.25rem] rounded-[var(--radius-md)] border bg-[var(--color-surface-2)] px-4 text-base text-[var(--color-ink)]',
    'placeholder:text-[var(--color-ink-faint)] transition-colors',
    hasError ? 'border-[var(--color-danger)]' : 'border-[var(--color-hairline-strong)] focus:border-[var(--color-accent)]',
  ].join(' ');
}

function Field({
  id,
  label,
  optional = false,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[var(--color-ink)]">
        {label}
        {optional ? (
          <span className="ml-2 text-xs font-normal text-[var(--color-ink-faint)]">Optional</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  name,
  required = false,
  error,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  name: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-ink-muted)]">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          required={required}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[6px] border border-[var(--color-hairline-strong)] bg-[var(--color-surface-2)] accent-[var(--color-accent)]"
          aria-invalid={Boolean(error)}
        />
        <span className="leading-relaxed">{children}</span>
      </label>
      {error ? (
        <p role="alert" className="ml-8 mt-1 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

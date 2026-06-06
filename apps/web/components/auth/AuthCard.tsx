'use client';

import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-6 text-center text-sm text-gray-600">{footer}</div> : null}
    </div>
  );
}

export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none ring-black focus:ring-1"
      />
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function AuthSubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

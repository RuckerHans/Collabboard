'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PasswordField } from '@/src/components/form/PasswordField';
import { useAuth } from '@/src/hooks/useAuth';
import { getApiErrorMessage } from '@/src/lib/axios';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-panel"
      >
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-muted">Open your Collabboard workspace.</p>

        <label className="mt-6 block text-sm font-medium">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            {...form.register('email')}
          />
        </label>
        {form.formState.errors.email && <p className="mt-1 text-sm text-red-600">{form.formState.errors.email.message}</p>}

        <div className="mt-4">
          <PasswordField
            label="Password"
            autoComplete="current-password"
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
        </div>

        {login.error && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
            {getApiErrorMessage(login.error, 'Invalid email or password.')}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {login.isPending ? 'Signing in...' : 'Log in'}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          No account? <Link className="font-semibold text-brand-600" href="/register">Sign up</Link>
        </p>
      </form>
    </main>
  );
}

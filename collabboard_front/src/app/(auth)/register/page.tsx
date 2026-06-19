'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/src/hooks/useAuth';
import { getApiErrorMessage } from '@/src/lib/axios';

const schema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(40, 'Username must be at most 40 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  avatarColor: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register } = useAuth();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', email: '', password: '', avatarColor: '#2563eb' },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => register.mutate(values))}
        className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-panel"
      >
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-muted">Start a shared board in seconds.</p>

        <label className="mt-6 block text-sm font-medium">
          Username
          <input
            autoComplete="username"
            className="mt-2 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            {...form.register('username')}
          />
        </label>
        {form.formState.errors.username && <p className="mt-1 text-sm text-red-600">{form.formState.errors.username.message}</p>}

        <label className="mt-4 block text-sm font-medium">
          Email
          <input
            autoComplete="email"
            className="mt-2 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            {...form.register('email')}
          />
        </label>
        {form.formState.errors.email && <p className="mt-1 text-sm text-red-600">{form.formState.errors.email.message}</p>}

        <label className="mt-4 block text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="new-password"
            className="mt-2 w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-50"
            {...form.register('password')}
          />
        </label>
        {form.formState.errors.password && <p className="mt-1 text-sm text-red-600">{form.formState.errors.password.message}</p>}

        <label className="mt-4 block text-sm font-medium">
          Avatar color
          <input type="color" className="mt-2 h-10 w-full rounded-md border border-line px-2" {...form.register('avatarColor')} />
        </label>

        {register.error && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
            {getApiErrorMessage(register.error, 'Could not create account. Check that email and username are unique.')}
          </p>
        )}

        <button
          type="submit"
          disabled={register.isPending}
          className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {register.isPending ? 'Creating...' : 'Create account'}
        </button>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account? <Link className="font-semibold text-brand-600" href="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}

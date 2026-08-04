import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await auth();
  if (session) redirect('/dashboard');

  return (
    <main className="shell">
      <div className="masthead">
        <h1>PaisaLog</h1>
        <span className="tag">Your ledger</span>
      </div>
      <div className="card">
        <p style={{ marginTop: 0, lineHeight: 1.6 }}>
          Note a spend or snap a receipt — it lands straight in a Google Sheet in your own Drive.
          Nothing is stored anywhere else.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/dashboard' });
          }}
        >
          <button className="btn" type="submit">
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}

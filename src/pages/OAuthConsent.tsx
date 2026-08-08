import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Loader2, Zap, Mail, Lock } from 'lucide-react';

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauth = () => (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auth form state (shown inline when signed out)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const returnTo = window.location.pathname + window.location.search;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Missing authorization_id');
        setAuthed(true);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!active) return;
      if (!sess.session) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const { data, error: detailsError } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('No redirect returned by the authorization server.');
      return;
    }
    window.location.href = target;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fn =
      mode === 'login'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + returnTo },
          });
    const { error: authError } = await fn;
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    window.location.href = returnTo;
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin + returnTo,
    });
    setBusy(false);
    if (result?.error) setError(result.error.message);
    else window.location.href = returnTo;
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm border border-border rounded-lg bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-sm bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <h1 className="font-display text-sm font-bold tracking-tight text-foreground">
            MBA<span className="text-primary">JOBSCOUT</span>
          </h1>
        </div>
        {children}
      </div>
    </main>
  );

  if (authed === null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      </Shell>
    );
  }

  if (authed === false) {
    return (
      <Shell>
        <h2 className="font-display text-base font-bold text-foreground mb-1">Sign in to continue</h2>
        <p className="text-xs text-muted-foreground mb-4">
          You need an account to connect an app to MBAJOBSCOUT.
        </p>
        <button
          onClick={handleGoogle}
          disabled={busy}
          className="w-full px-4 py-2 mb-3 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          Continue with Google
        </button>
        <form onSubmit={handleSignIn} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={6}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mode === 'login' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary hover:underline">
            {mode === 'login' ? 'Create an account' : 'Already have an account?'}
          </button>
        </p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <h2 className="font-display text-base font-bold text-foreground mb-1">Authorization failed</h2>
        <p className="text-xs text-muted-foreground">{error}</p>
      </Shell>
    );
  }

  if (!details) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization request…
        </p>
      </Shell>
    );
  }

  const clientName = details.client?.name ?? 'an app';

  return (
    <Shell>
      <h2 className="font-display text-base font-bold text-foreground mb-1">
        Connect {clientName}
      </h2>
      <p className="text-xs text-muted-foreground mb-5">
        {clientName} will be able to search jobs and manage your saved, applied and dismissed roles as you.
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </Shell>
  );
}

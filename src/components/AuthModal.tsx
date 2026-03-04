import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, Loader2, X } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    const isEmailNotConfirmedError = (err: unknown) => {
      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: string }).message).toLowerCase() : '';
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code).toLowerCase() : '';
      return code === 'email_not_confirmed' || message.includes('email not confirmed');
    };

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;

        if (!data.session) {
          try {
            await supabase.auth.resend({ type: 'signup', email });
          } catch {
            // ignore resend failures, keep UX smooth
          }
          toast({
            title: 'Confirm your email',
            description: 'We sent a confirmation link. Please verify your email, then sign in.',
          });
          onClose();
          return;
        }

        toast({ title: 'Account created!' });
        onSuccess();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Signed in successfully' });
        onSuccess();
      }
    } catch (err: unknown) {
      if (isEmailNotConfirmedError(err)) {
        try {
          await supabase.auth.resend({ type: 'signup', email });
        } catch {
          // ignore resend failures, still guide user clearly
        }
        onClose();
        toast({
          title: 'Email verification needed',
          description: 'We re-sent your confirmation link. Please verify your email, then sign in again.',
        });
        return;
      }

      const description = typeof err === 'object' && err && 'message' in err ? String((err as { message?: string }).message) : 'Please try again.';
      toast({ title: 'Auth error', description, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 border border-border rounded-lg bg-card p-6 shadow-xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display text-lg font-bold text-foreground mb-1">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {mode === 'login' ? 'Sign in to manage your job alerts' : 'Create an account to set up daily job alerts'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              required
              minLength={6}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-primary hover:underline font-medium"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

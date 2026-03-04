import { useState, useEffect } from 'react';
import { Bell, BellOff, Mail, Loader2, Send, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from '@/components/AuthModal';

interface AlertConfigProps {
  keywords: string[];
  location: string;
  sourceNames: string[];
}

export function AlertConfig({ keywords, location, sourceNames }: AlertConfigProps) {
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (user) {
      loadAlert();
      setEmail(user.email || '');
    } else {
      setAlertId(null);
      setEmail('');
      setEnabled(false);
      setLoading(false);
    }
  }, [user]);

  const loadAlert = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('job_alerts')
      .select('*')
      .eq('user_id', user!.id)
      .limit(1)
      .single();

    if (data) {
      setEmail(data.email || '');
      setEnabled(data.enabled || false);
      setAlertId(data.id);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!email || !email.includes('@')) {
      toast({ title: 'Invalid email', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        email,
        enabled,
        keywords,
        location,
        source_names: sourceNames,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      if (alertId) {
        await supabase.from('job_alerts').update(payload).eq('id', alertId);
      } else {
        const { data } = await supabase.from('job_alerts').insert(payload).select().single();
        if (data) setAlertId(data.id);
      }

      toast({ title: enabled ? 'Daily alert enabled' : 'Alert saved (paused)' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestAlert = async () => {
    if (!email || !email.includes('@')) {
      toast({ title: 'Save your email first', variant: 'destructive' });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-job-alerts', {
        body: { test: true, recipientEmail: email },
      });
      if (error) throw error;

      if (data?.count > 0) {
        toast({ title: `Test alert sent!`, description: `${data.count} sample jobs emailed to ${email}` });
      } else {
        toast({ title: 'No jobs found', description: 'Scrape some jobs first, then try again' });
      }
    } catch (err) {
      console.error('Test alert error:', err);
      toast({ title: 'Alert failed', description: 'Check your Resend API key', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (authLoading) return null;

  // Not logged in — show sign-in prompt
  if (!user) {
    return (
      <>
        <div className="border border-border rounded-md bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-display text-sm font-semibold text-foreground">Daily Alerts</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Sign in to set up daily email alerts for new job postings.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Sign in to enable alerts
          </button>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      </>
    );
  }

  if (loading) return null;

  return (
    <div className="border border-border rounded-md bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-display text-sm font-semibold text-foreground">Daily Alerts</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEnabled(!enabled); }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              enabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleTestAlert}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Test
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {enabled
            ? "You'll receive an email when new jobs are found during the daily scrape."
            : 'Enable to receive daily email alerts for new job postings.'}
        </p>
      </div>

      <button
        onClick={signOut}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <LogOut className="h-3 w-3" />
        Sign out ({user.email})
      </button>
    </div>
  );
}

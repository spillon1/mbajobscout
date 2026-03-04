import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function AlertConfig() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAlert();
  }, []);

  const loadAlert = async () => {
    const { data } = await supabase
      .from('scraped_jobs')
      .select('id')
      .limit(1);
    
    // Check for existing alert config (use anon, no auth needed)
    const { data: alertData } = await supabase
      .from('job_alerts')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (alertData) {
      setEnabled(alertData.enabled || false);
      setAlertId(alertData.id);
    }
    setLoaded(true);
  };

  const handleToggle = async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    setSaving(true);

    try {
      if (alertId) {
        await supabase
          .from('job_alerts')
          .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
          .eq('id', alertId);
      } else {
        const { data } = await supabase
          .from('job_alerts')
          .insert({
            email: 'spillon@gmail.com',
            enabled: newEnabled,
            keywords: [],
            location: '',
            source_names: [],
          })
          .select()
          .single();
        if (data) setAlertId(data.id);
      }
      toast({ title: newEnabled ? 'Daily alerts enabled' : 'Daily alerts paused' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
      setEnabled(!newEnabled);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-job-alerts', {
        body: { test: true },
      });
      if (error) throw error;

      if (data?.count > 0) {
        toast({ title: 'Test alert sent!', description: `${data.count} sample jobs emailed to spillon@gmail.com` });
      } else {
        toast({ title: 'No jobs found', description: 'Scrape some jobs first, then try again' });
      }
    } catch (err) {
      console.error('Test alert error:', err);
      toast({ title: 'Alert failed', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="border border-border rounded-md bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-display text-sm font-semibold text-foreground">Daily Alerts</span>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
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

      <p className="text-[10px] text-muted-foreground">
        {enabled
          ? "You'll receive daily email alerts when new jobs are found."
          : 'Enable to receive daily email alerts for new job postings.'}
      </p>

      <button
        onClick={handleTest}
        disabled={testing}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        {testing ? 'Sending...' : 'Send Test Alert'}
      </button>
    </div>
  );
}

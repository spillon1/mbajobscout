import { useState, useEffect } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function AlertConfig() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAlert();
  }, []);

  const loadAlert = async () => {
    const { data } = await supabase
      .from('job_alerts')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (data) {
      setEnabled(data.enabled || false);
      setAlertId(data.id);
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

  if (!loaded) return null;

  return (
    <div className="border border-border rounded-md bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Bell className="h-4 w-4 text-primary" />}
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
    </div>
  );
}

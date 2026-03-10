import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type JobAction = 'applied' | 'not_interested' | 'saved';

export interface JobActionRecord {
  id: string;
  job_url: string;
  job_title: string;
  job_company: string;
  job_source: string;
  action: JobAction;
  created_at: string;
}

export function useJobActions() {
  const { user } = useAuth();
  const [actions, setActions] = useState<JobActionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActions = useCallback(async () => {
    if (!user) {
      setActions([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('job_actions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setActions(data as unknown as JobActionRecord[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const addAction = useCallback(async (
    jobUrl: string,
    jobTitle: string,
    jobCompany: string,
    jobSource: string,
    action: JobAction
  ): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('job_actions')
      .upsert({
        user_id: user.id,
        job_url: jobUrl,
        job_title: jobTitle,
        job_company: jobCompany,
        job_source: jobSource,
        action,
      }, { onConflict: 'user_id,job_url,action' })
      .select('id')
      .single();

    if (!error) {
      await fetchActions();
      return data?.id ?? null;
    }
    return null;
  }, [fetchActions, user]);

  const removeAction = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('job_actions')
      .delete()
      .eq('id', id);

    if (!error) {
      setActions(prev => prev.filter(a => a.id !== id));
    }
    return !error;
  }, []);

  const actionedUrls = new Set(actions.map(a => a.job_url));
  const appliedJobs = actions.filter(a => a.action === 'applied');
  const notInterestedJobs = actions.filter(a => a.action === 'not_interested');
  const savedJobs = actions.filter(a => a.action === 'saved');

  return {
    actions,
    loading,
    addAction,
    removeAction,
    actionedUrls,
    appliedJobs,
    notInterestedJobs,
    savedJobs,
    isAuthenticated: !!user,
  };
}

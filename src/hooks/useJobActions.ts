import { useState, useEffect, useCallback, useRef } from 'react';
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
  const userId = user?.id ?? null;
  const [actions, setActions] = useState<JobActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  const fetchActions = useCallback(async () => {
    if (!userId) {
      setActions([]);
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);

    const { data, error } = await supabase
      .from('job_actions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Only apply results from the latest fetch
    if (id !== fetchIdRef.current) return;

    if (!error && data) {
      setActions(data as unknown as JobActionRecord[]);
    }
    setLoading(false);
  }, [userId]);

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
    if (!userId) return null;
    const { data, error } = await supabase
      .from('job_actions')
      .upsert({
        user_id: userId,
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
  }, [fetchActions, userId]);

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
    isAuthenticated: !!userId,
  };
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

/** Strip tracking params so the same job matches across scrapes */
export function normalizeJobUrl(url: string): string {
  try {
    const u = new URL(url);
    // Indeed: keep only the job key (jk param) or path
    if (/indeed\.com/i.test(u.hostname)) {
      const jk = u.searchParams.get('jk');
      if (jk) return `${u.origin}${u.pathname}?jk=${jk}`;
      // /viewjob?jk= or /rc/clk paths – strip everything else
      return `${u.origin}${u.pathname}`;
    }
    // LinkedIn: strip refId, trackingId, trk params
    if (/linkedin\.com/i.test(u.hostname)) {
      ['refId', 'trackingId', 'trk', 'midToken', 'midSig'].forEach(p => u.searchParams.delete(p));
      return u.toString();
    }
    // Glassdoor: strip tracking params
    if (/glassdoor/i.test(u.hostname)) {
      ['src', 'srs', 't', 'pos'].forEach(p => u.searchParams.delete(p));
      return u.toString();
    }
    // Default: strip common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

/** Create a title+company key for fallback matching */
function titleCompanyKey(title: string, company: string): string {
  return `${title.toLowerCase().trim()}|||${company.toLowerCase().trim()}`;
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
        job_url: normalizeJobUrl(jobUrl),
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

  // Build normalized URL set + title+company fallback set
  const actionedUrls = useMemo(() => new Set(actions.map(a => normalizeJobUrl(a.job_url))), [actions]);
  const actionedTitleCompany = useMemo(() => new Set(actions.map(a => titleCompanyKey(a.job_title, a.job_company))), [actions]);

  const appliedJobs = actions.filter(a => a.action === 'applied');
  const notInterestedJobs = actions.filter(a => a.action === 'not_interested');
  const savedJobs = actions.filter(a => a.action === 'saved');

  /** Check if a job has been actioned (by normalized URL or title+company) */
  const isActioned = useCallback((jobUrl: string, title: string, company: string): boolean => {
    return actionedUrls.has(normalizeJobUrl(jobUrl)) || actionedTitleCompany.has(titleCompanyKey(title, company));
  }, [actionedUrls, actionedTitleCompany]);

  return {
    actions,
    loading,
    addAction,
    removeAction,
    actionedUrls,
    actionedTitleCompany,
    isActioned,
    appliedJobs,
    notInterestedJobs,
    savedJobs,
    isAuthenticated: !!userId,
  };
}

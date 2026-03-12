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

/** Normalize text for stable dedupe keys */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip tracking params so the same job matches across scrapes */
export function normalizeJobUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';

    // Indeed: keep only the stable job key (jk) when present
    if (/indeed\.com/i.test(u.hostname)) {
      const jk = u.searchParams.get('jk');
      const path = u.pathname.replace(/\/+$/, '') || '/';
      return jk ? `${u.origin}${path}?jk=${jk}` : `${u.origin}${path}`;
    }

    // LinkedIn: drop volatile tracking params
    if (/linkedin\.com/i.test(u.hostname)) {
      ['refId', 'trackingId', 'trk', 'midToken', 'midSig'].forEach((p) => u.searchParams.delete(p));
    }

    // Glassdoor: drop volatile tracking params
    if (/glassdoor/i.test(u.hostname)) {
      ['src', 'srs', 't', 'pos'].forEach((p) => u.searchParams.delete(p));
    }

    // Default: strip common tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'].forEach((p) => u.searchParams.delete(p));

    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return url;
  }
}

/** Create a stable title+company key for fallback matching */
function titleCompanyKey(title: string, company: string): string {
  return `${normalizeText(title)}|||${normalizeText(company)}`;
}

function dedupeActionRecords(records: JobActionRecord[]): JobActionRecord[] {
  const seen = new Set<string>();
  const unique: JobActionRecord[] = [];

  // Keep newest row for each (action + title+company) tuple
  for (const record of records) {
    const key = `${record.action}|||${titleCompanyKey(record.job_title, record.job_company)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...record, job_url: normalizeJobUrl(record.job_url) });
  }

  return unique;
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
      setActions(dedupeActionRecords(data as unknown as JobActionRecord[]));
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

    const normalizedUrl = normalizeJobUrl(jobUrl);
    const incomingKey = `${action}|||${titleCompanyKey(jobTitle, jobCompany)}`;
    const existing = actions.find(
      (a) => `${a.action}|||${titleCompanyKey(a.job_title, a.job_company)}` === incomingKey
    );

    // Already actioned for this role/company/action — avoid creating duplicates
    if (existing) {
      return existing.id;
    }

    const { data, error } = await supabase
      .from('job_actions')
      .upsert({
        user_id: userId,
        job_url: normalizedUrl,
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
  }, [actions, fetchActions, userId]);

  const removeAction = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('job_actions')
      .delete()
      .eq('id', id);

    if (!error) {
      setActions((prev) => prev.filter((a) => a.id !== id));
    }
    return !error;
  }, []);

  // Build normalized URL set + title+company fallback set
  const actionedUrls = useMemo(() => new Set(actions.map((a) => normalizeJobUrl(a.job_url))), [actions]);
  const actionedTitleCompany = useMemo(() => new Set(actions.map((a) => titleCompanyKey(a.job_title, a.job_company))), [actions]);

  const appliedJobs = actions.filter((a) => a.action === 'applied');
  const notInterestedJobs = actions.filter((a) => a.action === 'not_interested');
  const savedJobs = actions.filter((a) => a.action === 'saved');

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

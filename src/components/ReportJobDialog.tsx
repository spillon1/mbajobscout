import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Job } from '@/types/jobs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ReportJobDialogProps {
  open: boolean;
  onClose: () => void;
  job: Job;
}

export function ReportJobDialog({ open, onClose, job }: ReportJobDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('report-job', {
        body: {
          jobTitle: job.title,
          jobCompany: job.company,
          jobSource: job.source,
          jobUrl: job.jobUrl || job.sourceUrl,
          reason: reason.trim(),
        },
      });
      if (error) throw error;
      toast({ title: 'Report submitted', description: 'Thanks for helping us improve!' });
      setReason('');
      onClose();
    } catch (err) {
      console.error('Report error:', err);
      toast({ title: 'Failed to submit report', description: 'Please try again later.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-sm uppercase tracking-wider">Report this role</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{job.title}</span> at {job.company}
          </div>
          <Textarea
            placeholder="Why are you reporting this role? (e.g. not relevant to the search category, duplicate, spam...)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="text-sm"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!reason.trim() || isSubmitting}>
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

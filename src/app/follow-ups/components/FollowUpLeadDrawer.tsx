'use client';
import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { leadsService, leadCommentsService } from '@/lib/services/crmService';
import type { Lead, LeadStatus } from '@/app/leads-management/components/mockLeads';
import LeadProfileDrawer, { scheduleLeadFollowUp } from '@/app/leads-management/components/LeadProfileDrawer';
import StatusNoteModal from '@/app/leads-management/components/StatusNoteModal';

const LogCallModal = dynamic(() => import('@/app/leads-management/components/LogCallModal'), { ssr: false });

/**
 * The Leads Management profile drawer, opened on the Follow-ups page so the agent never leaves the list.
 * Stage, next action date, notes and calls work here; every change calls `onChanged` so the list refreshes.
 */
export default function FollowUpLeadDrawer({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, profile } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [failed, setFailed] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null);
  const [logCallLead, setLogCallLead] = useState<Lead | null>(null);
  const [callHistoryKey, setCallHistoryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLead(null);
    setFailed(false);
    leadsService
      .getById(leadId)
      .then((l) => {
        if (!alive) return;
        if (!l) {
          setFailed(true);
          return;
        }
        setLead(l as Lead);
        setScheduleDate((l as Lead).followUpDue || '');
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [leadId]);

  // The list behind the drawer refreshes (in place, no loader) after each change and again when it closes,
  // which also covers notes added inside the drawer.
  const close = useCallback(() => {
    onClose();
    onChanged();
  }, [onClose, onChanged]);

  const markChanged = () => onChanged();

  useEffect(() => {
    if (!failed) return;
    toast.error('Could not open this lead.');
    onClose();
  }, [failed, onClose]);

  const applyStatus = async (status: LeadStatus, note: string | null) => {
    if (!lead) return;
    try {
      if (note) await leadCommentsService.create(lead.id, note, user?.id || '');
      await leadsService.updateStatus(lead.id, status);
      setLead((l) => (l ? { ...l, status } : l));
      toast.success(`Lead status updated to ${status}`);
      markChanged();
    } catch (err: any) {
      toast.error(
        /NOTE_REQUIRED/.test(String(err?.message))
          ? 'Write a note first: the stage cannot change without one.'
          : err?.message || 'Failed to update status'
      );
    }
  };

  const handleStatusChange = (_id: string, status: LeadStatus) => {
    if (!lead || lead.status === status) return;
    // Sales users write a note before a stage change (same rule as Leads Management).
    if (!isAdminRole(profile?.role)) setPendingStatus(status);
    else void applyStatus(status, null);
  };

  const handleScheduleFollowUp = async () => {
    if (!lead) return;
    const dueDate = scheduleDate.trim();
    const dueTime = scheduleTime.trim() || '09:00';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      toast.error('Pick a next action date');
      return;
    }
    const slot = new Date(`${dueDate}T${dueTime}:00`);
    if (!Number.isNaN(slot.getTime()) && slot.getTime() < Date.now() - 15 * 60 * 1000) {
      toast.error('Pick a future slot');
      return;
    }
    setScheduleSaving(true);
    try {
      await scheduleLeadFollowUp(lead, dueDate, dueTime, scheduleNotes.trim(), user?.id || '');
      setLead((l) => (l ? { ...l, followUpDue: dueDate } : l));
      setScheduleNotes('');
      toast.success(`Next action set for ${dueDate} ${dueTime}`);
      markChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save the next action date');
    } finally {
      setScheduleSaving(false);
    }
  };

  if (failed) return null;

  if (!lead) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <Loader2 size={24} className="animate-spin text-primary" aria-label="Loading lead" />
      </div>
    );
  }

  return (
    <>
      <LeadProfileDrawer
        lead={lead}
        onClose={close}
        onStatusChange={handleStatusChange}
        onLogCall={(l) => setLogCallLead(l)}
        scheduleDate={scheduleDate}
        setScheduleDate={setScheduleDate}
        scheduleTime={scheduleTime}
        setScheduleTime={setScheduleTime}
        scheduleNotes={scheduleNotes}
        setScheduleNotes={setScheduleNotes}
        handleScheduleFollowUp={handleScheduleFollowUp}
        scheduleSaving={scheduleSaving}
        callHistoryKey={callHistoryKey}
      />
      <StatusNoteModal
        open={!!pendingStatus}
        leadLabel={lead.name || 'Lead'}
        status={pendingStatus || ''}
        onCancel={() => setPendingStatus(null)}
        onConfirm={(note) => {
          const s = pendingStatus;
          setPendingStatus(null);
          if (s) void applyStatus(s, note);
        }}
      />
      {logCallLead && (
        <LogCallModal
          lead={logCallLead}
          onClose={() => setLogCallLead(null)}
          onDone={() => {
            setLogCallLead(null);
            setCallHistoryKey((k) => k + 1);
            markChanged();
          }}
        />
      )}
    </>
  );
}

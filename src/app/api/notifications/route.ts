import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface AppNotification {
  id: string;
  type: 'assignment' | 'reminder';
  title: string;
  text: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

// GET /api/notifications — a personal feed for the signed-in user:
//  - "assignment": activity_log rows (action_type = 'Lead Assigned') targeting this user
//  - "reminder": follow-ups due today / overdue / tomorrow that belong to this user
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ notifications: [] }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const notifications: AppNotification[] = [];

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('id', user.id)
      .single();

    // 1) Reminders from follow-ups that are actionable and due today/overdue/tomorrow.
    const { data: dueFollowUps } = await supabase
      .from('follow_ups')
      .select('id, title, contact_name, due_date, due_time, follow_up_status, agent, created_by')
      .lte('due_date', tomorrow)
      .not('follow_up_status', 'in', '("Completed","Cancelled")')
      .order('due_date', { ascending: true })
      .limit(100);

    for (const f of dueFollowUps || []) {
      const mine =
        f.created_by === user.id ||
        (profile && f.agent && profile.full_name && f.agent === profile.full_name);
      if (!mine) continue;

      const due = String(f.due_date || '');
      const overdue = due < today;
      const isToday = due === today;
      if (!overdue && !isToday) continue;

      const label = overdue
        ? `Overdue follow-up · ${due}`
        : `Due today · ${due}${f.due_time ? ` ${f.due_time}` : ''}`;
      notifications.push({
        id: `rem-${f.id}-${due}`,
        type: 'reminder',
        title: overdue ? 'Overdue follow-up' : 'Follow-up due today',
        text: f.title || `Follow up with ${f.contact_name || 'contact'}`,
        entityType: 'follow_up',
        entityId: f.id,
        createdAt: new Date(`${due}T00:00:00`).toISOString(),
      });
    }

    // 2) Assignments: activity_log rows pushed to this user when a lead is assigned to them.
    const { data: assignments } = await supabase
      .from('activity_log')
      .select('id, action_type, entity_type, entity_id, detail, meta, created_at')
      .eq('user_id', user.id)
      .eq('action_type', 'Lead Assigned')
      .order('created_at', { ascending: false })
      .limit(20);

    for (const a of assignments || []) {
      notifications.push({
        id: `ass-${a.id}`,
        type: 'assignment',
        title: 'New lead assigned to you',
        text: a.detail || 'A lead has been assigned to you',
        entityType: a.entity_type || 'lead',
        entityId: a.entity_id || '',
        createdAt: a.created_at,
      });
    }
  } catch {
    // Swallow — a broken feed should never break the shell.
  }

  notifications.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return NextResponse.json({ notifications });
}

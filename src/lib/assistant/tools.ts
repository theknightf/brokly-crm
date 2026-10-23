import { tool } from 'ai';
import { z } from 'zod';
import {
  normalizeArabic,
  extractKeywords,
  getArabicSearchVariants,
  mapArabicToStage,
} from './arabicNormalizer';
import { ALL_REAL_STATUSES } from '@/app/leads-management/components/leadStages';

/**
 * Creates user-scoped assistant tools that query Supabase
 * using the authenticated user's session client (respecting RLS).
 */
export function createAssistantTools(supabase: any, userId: string) {
  // Helper to log tool usage into assistant_logs
  const logToolCall = async (toolName: string, args: any, status: string, summary: string) => {
    try {
      await supabase.from('assistant_logs').insert({
        user_id: userId,
        tool_name: toolName,
        tool_args: args,
        status,
        result_summary: summary,
      });
    } catch {
      // non-blocking
    }
  };

  return {
    // ─── 1. SMART ARABIC NOTES & LEAD SEARCH ───────────────────
    searchLeadsByNoteOrKeyword: tool({
      description:
        'Searches leads (name, phone, area, project) and notes/comments using keywords or Arabic normalized text. Always call this when an agent asks about a client or property requirement (e.g. "في عميل عاوز يشتري في النرجس").',
      parameters: z.object({
        keyword: z.string().describe('The keyword, location, compound, or client requirement to search for (e.g. "النرجس", "العبور", "شقة", "أحمد")'),
        limit: z.number().int().min(1).max(10).optional().default(5).describe('Max results to return (max 10)'),
      }),
      execute: async ({ keyword, limit = 5 }) => {
        const raw = keyword.trim();
        const extracted = extractKeywords(raw);
        const variants = getArabicSearchVariants(raw);
        const searchTerms = Array.from(new Set([...extracted, ...variants, raw])).filter((t) => t.length >= 2);

        // 1. Search leads table
        let leadsQuery = supabase
          .from('leads')
          .select('id, name, phone, crm_status, location, project, notes, created_at, agent')
          .order('created_at', { ascending: false })
          .limit(limit);

        const orClauses = searchTerms
          .slice(0, 4)
          .flatMap((t) => [
            `name.ilike.%${t}%`,
            `notes.ilike.%${t}%`,
            `location.ilike.%${t}%`,
            `project.ilike.%${t}%`,
            `phone.ilike.%${t}%`,
          ])
          .join(',');

        if (orClauses) {
          leadsQuery = leadsQuery.or(orClauses);
        }

        const { data: leads, error: leadsError } = await leadsQuery;

        // 2. Search comments table for matching notes
        let commentsQuery = supabase
          .from('lead_comments')
          .select('id, lead_id, body, created_at, author:user_profiles!lead_comments_user_id_fkey(full_name), leads(id, name, phone, crm_status, location, project)')
          .order('created_at', { ascending: false })
          .limit(limit);

        const commentClauses = searchTerms
          .slice(0, 4)
          .map((t) => `body.ilike.%${t}%`)
          .join(',');

        if (commentClauses) {
          commentsQuery = commentsQuery.or(commentClauses);
        }

        const { data: comments } = await commentsQuery;

        const results: any[] = [];
        const seenLeadIds = new Set<string>();

        // Process leads matches
        for (const l of leads || []) {
          seenLeadIds.add(l.id);
          results.push({
            leadId: l.id,
            id: l.id,
            name: l.name,
            phone: l.phone,
            stage: l.crm_status,
            status: l.crm_status,
            project: l.project || l.location || '',
            matchingNote: l.notes || '',
            matchingSnippet: l.notes ? l.notes.slice(0, 160) : null,
            noteDate: l.created_at ? l.created_at.slice(0, 10) : null,
            authorAgent: l.agent || 'Agent',
            openUrl: `/leads-management?leadId=${l.id}`,
            whatsappUrl: l.phone ? `https://wa.me/${l.phone.replace(/\D/g, '')}` : null,
          });
        }

        // Process comments matches
        for (const c of comments || []) {
          if (!c.leads) continue;
          if (!seenLeadIds.has(c.lead_id)) {
            seenLeadIds.add(c.lead_id);
            results.push({
              leadId: c.leads.id,
              id: c.leads.id,
              name: c.leads.name,
              phone: c.leads.phone,
              stage: c.leads.crm_status,
              status: c.leads.crm_status,
              project: c.leads.project || c.leads.location || '',
              matchingNote: c.body || '',
              matchingSnippet: c.body ? c.body.slice(0, 160) : null,
              noteDate: c.created_at ? c.created_at.slice(0, 10) : null,
              authorAgent: c.author?.full_name || 'Agent',
              openUrl: `/leads-management?leadId=${c.leads.id}`,
              whatsappUrl: c.leads.phone ? `https://wa.me/${c.leads.phone.replace(/\D/g, '')}` : null,
            });
          }
        }

        const finalResults = results.slice(0, limit);
        await logToolCall(
          'searchLeadsByNoteOrKeyword',
          { keyword, limit },
          leadsError ? 'error' : 'executed',
          `Found ${finalResults.length} leads matching "${keyword}"`
        );

        return {
          keyword,
          matchCount: finalResults.length,
          leads: finalResults,
        };
      },
    }),

    // ─── 1B. SEARCH LEADS AND NOTES (COMPATIBILITY ALIAS) ─────
    search_leads_and_notes: tool({
      description:
        'Searches leads (name, phone, area, project) and notes/comments using keywords or Arabic normalized text. Always call this when an agent asks about a client or property requirement.',
      parameters: z.object({
        query: z.string().describe('The search query or keyword (e.g. "النرجس", "فيلا زايد", "أحمد")'),
        status: z.string().optional().describe('Optional filter by lead pipeline status'),
        limit: z.number().int().min(1).max(10).optional().default(5).describe('Max results to return (max 10)'),
      }),
      execute: async ({ query, status, limit }) => {
        const keywords = extractKeywords(query);
        const normQuery = normalizeArabic(query);
        const term = keywords[0] || normQuery || query;

        // Search leads table via user RLS
        let leadsQuery = supabase
          .from('leads')
          .select('id, name, phone, crm_status, location, project, notes, created_at, agent')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) {
          leadsQuery = leadsQuery.eq('crm_status', status);
        }

        // Apply fuzzy / trigram or ilike search
        if (term) {
          leadsQuery = leadsQuery.or(
            `name.ilike.%${term}%,notes.ilike.%${term}%,location.ilike.%${term}%,project.ilike.%${term}%,phone.ilike.%${term}%`
          );
        }

        const { data: leads, error: leadsError } = await leadsQuery;

        // Also search comments table for matching notes
        let commentsQuery = supabase
          .from('lead_comments')
          .select('id, lead_id, body, created_at, author:user_profiles!lead_comments_user_id_fkey(full_name), leads(id, name, phone, crm_status)')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (term) {
          commentsQuery = commentsQuery.ilike('body', `%${term}%`);
        }

        const { data: comments } = await commentsQuery;

        const results: any[] = [];
        const seenLeadIds = new Set<string>();

        // 1. Process matching leads
        for (const l of leads || []) {
          seenLeadIds.add(l.id);
          results.push({
            leadId: l.id,
            name: l.name,
            phone: l.phone,
            status: l.crm_status,
            project: l.project || l.location || '',
            matchingSnippet: l.notes ? l.notes.slice(0, 150) : null,
            noteDate: l.created_at ? l.created_at.slice(0, 10) : null,
            authorAgent: l.agent || 'Agent',
            openUrl: `/leads-management?leadId=${l.id}`,
            whatsappUrl: l.phone ? `https://wa.me/${l.phone.replace(/\D/g, '')}` : null,
          });
        }

        // 2. Process matching comments/notes
        for (const c of comments || []) {
          if (!c.leads) continue;
          if (!seenLeadIds.has(c.lead_id)) {
            seenLeadIds.add(c.lead_id);
            results.push({
              leadId: c.leads.id,
              name: c.leads.name,
              phone: c.leads.phone,
              status: c.leads.crm_status,
              project: '',
              matchingSnippet: c.body ? c.body.slice(0, 150) : null,
              noteDate: c.created_at ? c.created_at.slice(0, 10) : null,
              authorAgent: c.author?.full_name || 'Agent',
              openUrl: `/leads-management?leadId=${c.leads.id}`,
              whatsappUrl: c.leads.phone ? `https://wa.me/${c.leads.phone.replace(/\D/g, '')}` : null,
            });
          }
        }

        const finalResults = results.slice(0, limit);
        await logToolCall(
          'search_leads_and_notes',
          { query, status, limit },
          leadsError ? 'error' : 'executed',
          `Found ${finalResults.length} leads matching "${query}"`
        );

        return {
          query,
          matchCount: finalResults.length,
          leads: finalResults,
        };
      },
    }),

    // ─── 2. GET LEAD DETAILS ───────────────────────────────────
    get_lead_details: tool({
      description: 'Retrieves full details for a specific lead, including recent notes and upcoming follow-ups.',
      parameters: z.object({
        leadId: z.string().describe('The UUID of the lead'),
      }),
      execute: async ({ leadId }) => {
        // Fetch lead with RLS
        const { data: lead, error } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .maybeSingle();

        if (error || !lead) {
          await logToolCall('get_lead_details', { leadId }, 'error', 'Lead not found or permission denied');
          return { error: 'Lead not found or you do not have permission to view it.' };
        }

        // Fetch last 5 comments/notes
        const { data: comments } = await supabase
          .from('lead_comments')
          .select('id, body, created_at, author:user_profiles!lead_comments_user_id_fkey(full_name)')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(5);

        // Fetch next pending follow-up
        const { data: followUps } = await supabase
          .from('follow_ups')
          .select('id, title, due_date, due_time, notes, follow_up_status')
          .eq('lead_id', leadId)
          .eq('follow_up_status', 'Pending')
          .order('due_date', { ascending: true })
          .limit(1);

        const details = {
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.crm_status,
          propertyType: lead.property_type,
          project: lead.project,
          budget: lead.budget_max || lead.budget_min,
          notes: lead.notes,
          recentNotes: (comments || []).map((c: any) => ({
            text: c.body,
            author: c.author?.full_name || 'Agent',
            date: c.created_at ? c.created_at.slice(0, 10) : '',
          })),
          nextFollowUp: followUps?.[0]
            ? {
                date: followUps[0].due_date,
                time: followUps[0].due_time,
                title: followUps[0].title,
              }
            : null,
          openUrl: `/leads-management?leadId=${lead.id}`,
          whatsappUrl: lead.phone ? `https://wa.me/${lead.phone.replace(/\D/g, '')}` : null,
        };

        await logToolCall('get_lead_details', { leadId }, 'executed', `Fetched details for lead ${lead.name}`);
        return details;
      },
    }),

    // ─── 3. GET MY SUMMARY ─────────────────────────────────────
    get_my_summary: tool({
      description: 'Returns the current agent summary: today follow-ups, overdue follow-ups, and active leads count.',
      parameters: z.object({}),
      execute: async () => {
        const todayStr = new Date().toISOString().slice(0, 10);

        // Follow-ups due today
        const { data: todayFu } = await supabase
          .from('follow_ups')
          .select('id, title, contact_name, contact_phone, due_date, due_time, lead_id')
          .eq('due_date', todayStr)
          .eq('follow_up_status', 'Pending')
          .limit(10);

        // Overdue follow-ups
        const { data: overdueFu } = await supabase
          .from('follow_ups')
          .select('id, title, contact_name, contact_phone, due_date, lead_id')
          .lt('due_date', todayStr)
          .eq('follow_up_status', 'Pending')
          .limit(10);

        // Active leads assigned to this user
        const { count: activeLeadsCount } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', userId);

        const summary = {
          date: todayStr,
          todayFollowUpsCount: (todayFu || []).length,
          overdueFollowUpsCount: (overdueFu || []).length,
          activeLeadsCount: activeLeadsCount || 0,
          todayList: (todayFu || []).slice(0, 5).map((f: any) => ({
            id: f.id,
            title: f.title,
            clientName: f.contact_name,
            phone: f.contact_phone,
            time: f.due_time,
            leadId: f.lead_id,
          })),
        };

        await logToolCall('get_my_summary', {}, 'executed', `Summary for user ${userId}`);
        return summary;
      },
    }),

    // ─── 4. SMART STAGE UPDATE AND NOTE ADDITION (COMPOUND ACTION) ─────
    updateLeadStageAndAddNote: tool({
      description:
        'Resolves a lead (by explicit leadId, leadName, or useLastCalledLead: true for the most recently called contact from call logs), updates their stage, and/or adds a note. Requires user confirmation before execution.',
      parameters: z.object({
        leadId: z.string().optional().describe('UUID of the lead if known'),
        leadName: z.string().optional().describe('Name or partial name of the lead (e.g. "أحمد محمد")'),
        useLastCalledLead: z
          .boolean()
          .optional()
          .describe('Set to true if agent says "آخر عميل كلمته" or refers to the most recent call'),
        newStage: z
          .string()
          .optional()
          .describe('New stage or status for the lead (e.g. "Interested", "مهتم", "Following Up")'),
        noteText: z.string().optional().describe('Note or requirement text to add to the lead (e.g. "عاوز يشتري في العبور")'),
      }),
      execute: async ({ leadId, leadName, useLastCalledLead, newStage, noteText }) => {
        let resolvedLead: any = null;
        let resolutionNote = '';

        // 1. Resolve via explicit leadId
        if (leadId) {
          const { data } = await supabase
            .from('leads')
            .select('id, name, phone, crm_status, location, project')
            .eq('id', leadId)
            .maybeSingle();
          if (data) {
            resolvedLead = data;
            resolutionNote = 'بمعرف العميل (ID)';
          }
        }

        // 2. Resolve via last called lead
        if (!resolvedLead && useLastCalledLead) {
          const { data: lastCall } = await supabase
            .from('call_logs')
            .select('entity_id, lead_id, contact_name, contact_phone, created_at, outcome')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const targetId = lastCall?.entity_id || lastCall?.lead_id;
          if (targetId) {
            const { data: leadFromCall } = await supabase
              .from('leads')
              .select('id, name, phone, crm_status, location, project')
              .eq('id', targetId)
              .maybeSingle();
            if (leadFromCall) {
              resolvedLead = leadFromCall;
              resolutionNote = 'آخر عميل تم الاتصال به في سجل المكالمات';
            }
          }

          if (!resolvedLead && lastCall) {
            resolvedLead = {
              id: targetId || '',
              name: lastCall.contact_name || 'آخر عميل',
              phone: lastCall.contact_phone || '',
              crm_status: 'Fresh Leads',
            };
            resolutionNote = 'آخر مكالمة مسجلة';
          }
        }

        // 3. Resolve via leadName
        if (!resolvedLead && leadName) {
          const trimmed = leadName.trim();
          const { data: directMatches } = await supabase
            .from('leads')
            .select('id, name, phone, crm_status, location, project')
            .ilike('name', `%${trimmed}%`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (directMatches && directMatches.length > 0) {
            resolvedLead = directMatches[0];
            resolutionNote = `مطابقة الاسم "${trimmed}"`;
          } else {
            const keywords = extractKeywords(trimmed);
            if (keywords.length > 0) {
              const { data: fuzzyMatches } = await supabase
                .from('leads')
                .select('id, name, phone, crm_status, location, project')
                .ilike('name', `%${keywords[0]}%`)
                .order('created_at', { ascending: false })
                .limit(1);
              if (fuzzyMatches && fuzzyMatches.length > 0) {
                resolvedLead = fuzzyMatches[0];
                resolutionNote = `مطابقة تقريبية "${keywords[0]}"`;
              }
            }
          }
        }

        if (!resolvedLead || !resolvedLead.id) {
          return {
            error:
              'لم يتم العثور على العميل المطلوب. يرجى ذكر اسم العميل بدقة أو التأكد من وجود سجل مكالمات.',
            confirmationRequired: false,
          };
        }

        // Map stage to canonical CRM stage
        const canonicalStage = newStage ? mapArabicToStage(newStage) || newStage : undefined;

        const messageLines: string[] = [
          `هل تود تأكيد تحديث بيانات العميل ${resolvedLead.name}${resolvedLead.phone ? ` (${resolvedLead.phone})` : ''}؟`,
        ];
        if (canonicalStage) {
          messageLines.push(`• تغيير المرحلة: من "${resolvedLead.crm_status || 'Fresh Leads'}" إلى "${canonicalStage}"`);
        }
        if (noteText) {
          messageLines.push(`• إضافة ملاحظة: "${noteText.trim()}"`);
        }
        if (resolutionNote) {
          messageLines.push(`• طريقة التحديد: ${resolutionNote}`);
        }

        const pendingAction = {
          type: 'pending_action',
          action: 'update_lead_stage_and_add_note',
          leadId: resolvedLead.id,
          leadName: resolvedLead.name || 'عميل',
          leadPhone: resolvedLead.phone || '',
          currentStage: resolvedLead.crm_status || 'Fresh Leads',
          newStage: canonicalStage,
          noteText: noteText?.trim() || undefined,
          message: messageLines.join('\n'),
          confirmationRequired: true,
        };

        await logToolCall(
          'updateLeadStageAndAddNote',
          { leadId: resolvedLead.id, newStage: canonicalStage, noteText },
          'pending_confirmation',
          `Pending update for ${resolvedLead.name} (${canonicalStage || 'note only'})`
        );

        return pendingAction;
      },
    }),

    // ─── 5. ADD NOTE (WRITE - REQUIRES CONFIRMATION) ───────────
    add_note: tool({
      description: 'Prepares adding a new note or comment to a lead. REQUIRES user confirmation before executing.',
      parameters: z.object({
        leadId: z.string().describe('The UUID of the lead'),
        text: z.string().min(2).max(1000).describe('The note text to add'),
      }),
      execute: async ({ leadId, text }) => {
        // Fetch lead name for preview
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, phone')
          .eq('id', leadId)
          .maybeSingle();

        const pendingAction = {
          type: 'pending_action',
          action: 'add_note',
          leadId,
          leadName: lead?.name || 'Lead',
          text,
          message: `هل تود حفظ الملاحظة التالية للعميل ${lead?.name || ''}؟`,
          confirmationRequired: true,
        };

        await logToolCall(
          'add_note',
          { leadId, text },
          'pending_confirmation',
          `Pending note for ${lead?.name || leadId}`
        );

        return pendingAction;
      },
    }),

    // ─── 5. CREATE FOLLOW-UP (WRITE - REQUIRES CONFIRMATION) ────
    create_followup: tool({
      description: 'Prepares scheduling a follow-up for a lead. REQUIRES user confirmation before executing.',
      parameters: z.object({
        leadId: z.string().describe('The UUID of the lead'),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Due date formatted as YYYY-MM-DD'),
        note: z.string().optional().describe('Follow-up instructions or note'),
      }),
      execute: async ({ leadId, dueDate, note }) => {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, phone')
          .eq('id', leadId)
          .maybeSingle();

        const pendingAction = {
          type: 'pending_action',
          action: 'create_followup',
          leadId,
          leadName: lead?.name || 'Lead',
          contactPhone: lead?.phone || '',
          dueDate,
          note: note || '',
          message: `هل تود جدولة متابعة للعميل ${lead?.name || ''} بتاريخ ${dueDate}؟`,
          confirmationRequired: true,
        };

        await logToolCall(
          'create_followup',
          { leadId, dueDate, note },
          'pending_confirmation',
          `Pending follow-up for ${lead?.name || leadId} on ${dueDate}`
        );

        return pendingAction;
      },
    }),

    // ─── 6. UPDATE LEAD STATUS (WRITE - REQUIRES CONFIRMATION) ──
    update_lead_status: tool({
      description: 'Prepares updating a lead status. REQUIRES user confirmation before executing. Status must be an existing app stage.',
      parameters: z.object({
        leadId: z.string().describe('The UUID of the lead'),
        newStatus: z.enum(ALL_REAL_STATUSES as [string, ...string[]]).describe('The new stage for the lead'),
      }),
      execute: async ({ leadId, newStatus }) => {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, crm_status')
          .eq('id', leadId)
          .maybeSingle();

        const pendingAction = {
          type: 'pending_action',
          action: 'update_lead_status',
          leadId,
          leadName: lead?.name || 'Lead',
          oldStatus: lead?.crm_status || 'Fresh Leads',
          newStatus,
          message: `هل تود تغيير مرحلة العميل ${lead?.name || ''} من "${lead?.crm_status || ''}" إلى "${newStatus}"؟`,
          confirmationRequired: true,
        };

        await logToolCall(
          'update_lead_status',
          { leadId, newStatus },
          'pending_confirmation',
          `Pending status change for ${lead?.name || leadId} to ${newStatus}`
        );

        return pendingAction;
      },
    }),
  };
}

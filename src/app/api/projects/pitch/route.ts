import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/pitch
 *
 * Returns the sales pitch for the project linked to a lead / follow-up, or
 * for a project looked up by name. Everything is resolved from the project's
 * own database row — nothing is hardcoded.
 *
 * Query params:
 *   entity_type  – 'lead' | 'customer' | 'follow_up'
 *   entity_id    – the row id
 *   project      – (alternative) exact project name
 *   project_id   – (alternative) direct project id
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const entityType = url.searchParams.get('entity_type') || '';
  const entityId = url.searchParams.get('entity_id') || '';
  const projectNameParam = url.searchParams.get('project') || '';
  const projectId = url.searchParams.get('project_id') || '';

  let projectName = projectNameParam;

  try {
    // Resolve the project name from the linked entity when an id is provided.
    if (!projectName && entityId) {
      if (entityType === 'follow_up') {
        const { data: fu } = await supabase
          .from('follow_ups')
          .select('lead_id')
          .eq('id', entityId)
          .maybeSingle();
        if (fu?.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('project')
            .eq('id', fu.lead_id)
            .maybeSingle();
          projectName = lead?.project || '';
        }
      } else if (entityType === 'lead' || entityType === 'customer') {
        const { data: lead } = await supabase
          .from('leads')
          .select('project')
          .eq('id', entityId)
          .maybeSingle();
        projectName = lead?.project || '';
      }
    }

    if (!projectId && !projectName) {
      return NextResponse.json({ project: null, pitch: null });
    }

    let query = supabase
      .from('projects')
      .select('*, developers(id, name)');

    if (projectId) {
      query = query.eq('id', projectId).limit(1);
    } else {
      query = query.ilike('name', projectName.trim()).limit(1);
    }

    const { data: projects } = await query;
    const project = Array.isArray(projects) ? projects[0] : projects;

    if (!project) {
      return NextResponse.json({ project: null, pitch: null });
    }

    const sellingPoints = String(project.selling_points || '')
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        developerName: project.developers?.name || '',
        status: project.project_status,
      },
      pitch: {
        summary: project.pitch_summary || '',
        whyBuy: project.why_buy || '',
        sellingPoints,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

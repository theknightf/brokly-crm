import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/follow_up_model.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/follow_ups_service.dart';
import '../../data/services/supabase_service.dart';
import 'agent_controller.dart';
import 'agent_widgets.dart';
import 'call_mode_screen.dart';

String _today() => DateFormat('yyyy-MM-dd').format(DateTime.now());

/// Follow-ups tab: Overdue (red) · Today · Upcoming. Swipe to mark done or reschedule.
class AgentFollowUpsTab extends StatelessWidget {
  const AgentFollowUpsTab({super.key});

  static String? _leadIdOf(FollowUpModel f) =>
      f.leadId ?? (f.id.startsWith('lead-') ? f.id.replaceFirst('lead-', '') : null);

  /// Loads the leads behind a list of follow-ups in ONE query, keeping the follow-up order.
  static Future<List<LeadModel>> _leadsFor(List<FollowUpModel> items) async {
    final ids = <String>[];
    for (final f in items) {
      final id = _leadIdOf(f);
      if (id != null && !ids.contains(id)) ids.add(id);
    }
    if (ids.isEmpty) return [];
    final res = await SupabaseService().client.from('leads').select('*').inFilter('id', ids);
    final byId = {for (final e in res as List) (e['id'] as String): LeadModel.fromJson(e as Map<String, dynamic>)};
    return [for (final id in ids) if (byId[id] != null) byId[id]!];
  }

  Future<void> _callAllDue(BuildContext context, List<FollowUpModel> due) async {
    try {
      final leads = await _leadsFor(due);
      if (!context.mounted) return;
      await CallModeScreen.open(context, leads, title: 'المتابعات المستحقة');
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('معرفناش نجيب العملاء، جرب تاني')));
      }
    }
  }

  Future<void> _callOne(BuildContext context, FollowUpModel f) async {
    final leads = await _leadsFor([f]).catchError((_) => <LeadModel>[]);
    if (!context.mounted) return;
    if (leads.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('العميل ده مش متاح')));
      return;
    }
    final lead = leads.first;
    await AgentDialer.call(context, lead, onEnded: (meta, elapsed) {
      if (!context.mounted) return;
      OutcomeSheet.show(context, lead: lead, meta: meta, elapsedSeconds: elapsed);
    });
  }

  Future<void> _markDone(BuildContext context, FollowUpModel f) async {
    HapticFeedback.mediumImpact();
    final c = context.read<AgentController>();
    c.followUps = c.followUps.where((x) => x.id != f.id).toList();
    c.refreshSoon();
    await FollowUpsService().markComplete(f.id, leadId: _leadIdOf(f));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تمام، المتابعة اتقفلت')));
    }
  }

  Future<bool> _reschedule(BuildContext context, FollowUpModel f) async {
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(title: Text('أجّل المتابعة لإمتى؟', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
              ListTile(
                leading: const Icon(LucideIcons.clock),
                title: const Text('كمان ساعة'),
                onTap: () => Navigator.pop(ctx, DateTime.now().add(const Duration(hours: 1))),
              ),
              ListTile(
                leading: const Icon(LucideIcons.calendarClock),
                title: const Text('بكرة 11 الصبح'),
                onTap: () {
                  final n = DateTime.now();
                  Navigator.pop(ctx, DateTime(n.year, n.month, n.day + 1, 11));
                },
              ),
              ListTile(
                leading: const Icon(LucideIcons.calendar),
                title: const Text('اختار وقت'),
                onTap: () async {
                  final n = DateTime.now();
                  final d = await showDatePicker(context: ctx, initialDate: n, firstDate: n, lastDate: n.add(const Duration(days: 180)));
                  if (d == null || !ctx.mounted) return;
                  final t = await showTimePicker(context: ctx, initialTime: const TimeOfDay(hour: 11, minute: 0));
                  if (t == null || !ctx.mounted) return;
                  Navigator.pop(ctx, DateTime(d.year, d.month, d.day, t.hour, t.minute));
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
    if (picked == null) return false;
    final date = DateFormat('yyyy-MM-dd').format(picked);
    final time = DateFormat('HH:mm').format(picked);
    final db = SupabaseService().client;
    try {
      if (!f.id.startsWith('lead-')) {
        await db.from('follow_ups').update({'due_date': date, 'due_time': time}).eq('id', f.id);
      }
      final leadId = _leadIdOf(f);
      // The lead's follow-up date is the source of truth for "live" follow-ups (same rule as the website).
      if (leadId != null) await db.from('leads').update({'follow_up_due': date}).eq('id', leadId);
      if (context.mounted) {
        HapticFeedback.selectionClick();
        context.read<AgentController>().refreshSoon();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('اتأجلت لـ ${DateFormat('d/M h:mm a').format(picked)}')));
      }
      return true;
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('معرفناش نأجّل، جرب تاني')));
      }
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AgentController>();
    final today = _today();
    final overdue = c.followUps.where((f) => f.dueDate.compareTo(today) < 0).toList();
    final todayList = c.followUps.where((f) => f.dueDate == today).toList();
    final upcoming = c.followUps.where((f) => f.dueDate.compareTo(today) > 0).toList();
    final due = [...overdue, ...todayList];

    Widget section(String title, Color color, List<FollowUpModel> items) {
      if (items.isEmpty) return const SliverToBoxAdapter(child: SizedBox.shrink());
      return SliverMainAxisGroup(slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Row(children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Text('$title (${items.length})', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color)),
            ]),
          ),
        ),
        SliverList.builder(
          itemCount: items.length,
          itemBuilder: (_, i) {
            final f = items[i];
            final lead = LeadModel.fromJson({
              'id': _leadIdOf(f) ?? f.id,
              'name': f.contactName,
              'phone': f.contactPhone ?? '',
              'project': f.propertyInterest,
              'crm_status': '',
            });
            final when = '${f.dueDate == today ? 'النهارده' : f.dueDate}${(f.dueTime ?? '').isNotEmpty ? ' · ${f.dueTime}' : ''}';
            return Dismissible(
              key: ValueKey('fu-${f.id}'),
              background: _swipeBg(LucideIcons.check, 'خلصت', const Color(0xFF16A34A), AlignmentDirectional.centerStart),
              secondaryBackground: _swipeBg(LucideIcons.calendarClock, 'أجّل', const Color(0xFF3B82F6), AlignmentDirectional.centerEnd),
              confirmDismiss: (dir) async {
                if (dir == DismissDirection.startToEnd) {
                  unawaited(_markDone(context, f));
                  return true;
                }
                await _reschedule(context, f);
                return false; // the refresh moves it to its new group
              },
              child: AgentLeadCard(
                lead: lead,
                stageLabel: title,
                stageColor: color,
                subtitle: '${f.title.isNotEmpty ? '${f.title} · ' : ''}$when',
                subtitleColor: color == const Color(0xFFEF4444) ? color : null,
                onCall: () => _callOne(context, f),
              ),
            );
          },
        ),
      ]);
    }

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: c.loadFollowUps,
          child: CustomScrollView(
            slivers: [
              if (c.loadingFollowUps)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (c.followUpsError && c.followUps.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('معرفناش نحمّل المتابعات'),
                      const SizedBox(height: 8),
                      FilledButton(onPressed: c.loadFollowUps, child: const Text('جرّب تاني')),
                    ]),
                  ),
                )
              else if (c.followUps.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: Text('مفيش متابعات. كله تمام 👌', style: TextStyle(fontSize: 16))),
                )
              else ...[
                section('متأخرة', const Color(0xFFEF4444), overdue),
                section('النهارده', AppColors.neonLimeDark, todayList),
                section('الجاية', const Color(0xFF3B82F6), upcoming),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 96)),
            ],
          ),
        ),
        if (due.isNotEmpty)
          PositionedDirectional(
            start: 16,
            end: 16,
            bottom: 16,
            child: SizedBox(
              height: 60,
              child: FilledButton.icon(
                onPressed: () => _callAllDue(context, due),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.neonLimeDark,
                  foregroundColor: const Color(0xFF142407),
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                ),
                icon: const Icon(LucideIcons.phoneCall, size: 24),
                label: Text('اتصل بكل المستحق (${due.length})', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
            ),
          ),
      ],
    );
  }

  static Widget _swipeBg(IconData icon, String label, Color color, AlignmentGeometry align) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)),
        alignment: align,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: Colors.white),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
        ]),
      );
}

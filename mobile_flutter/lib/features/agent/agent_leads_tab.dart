import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/supabase_service.dart';
import 'agent_controller.dart';
import 'agent_widgets.dart';
import 'call_mode_screen.dart';

/// Leads tab: stage cards on top, search, and the calling queue (already sorted by the server:
/// new uncontacted → due today/overdue → the rest). One big "Start calling" button opens Call Mode.
class AgentLeadsTab extends StatelessWidget {
  const AgentLeadsTab({super.key});

  Future<void> _callStage(BuildContext context, String stage) async {
    // Fetch that stage's queue directly (independent of the filter shown below).
    try {
      final res = await SupabaseService().client.rpc('my_call_queue', params: {'p_stage': stage, 'p_limit': 300});
      final leads = (res as List).map((e) => LeadModel.fromJson(e as Map<String, dynamic>)).toList();
      if (!context.mounted) return;
      final label = context.read<AgentController>().stages.where((s) => s.key == stage).firstOrNull?.labelAr ?? stage;
      await CallModeScreen.open(context, leads, title: label);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('معرفناش نجيب العملاء، جرب تاني')));
      }
    }
  }

  void _startCalling(BuildContext context, AgentController c) {
    final resume = c.resumeLeadId;
    final canResume = c.selectedStage == null && resume != null && c.queue.any((l) => l.id == resume);
    unawaited(CallModeScreen.open(context, c.queue, startLeadId: canResume ? resume : null));
  }

  void _callOne(BuildContext context, AgentController c, LeadModel lead) {
    AgentDialer.call(context, lead, onEnded: (meta, elapsed) {
      if (!context.mounted) return;
      OutcomeSheet.show(context, lead: lead, meta: meta, elapsedSeconds: elapsed);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AgentController>();
    final stageByKey = {for (final s in c.stages) s.key: s};

    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: c.refreshAll,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: StageCardsRow(onCallStage: (s) => _callStage(context, s))),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                  child: TextField(
                    onChanged: c.setSearch,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'دوّر باسم العميل',
                      prefixIcon: const Icon(LucideIcons.search, size: 20),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ),
              if (c.loadingQueue)
                const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
              else if (c.queueError && c.queue.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('معرفناش نحمّل العملاء'),
                      const SizedBox(height: 8),
                      FilledButton(onPressed: c.loadQueue, child: const Text('جرّب تاني')),
                    ]),
                  ),
                )
              else if (c.queue.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: Text('مفيش عملاء هنا', style: TextStyle(fontSize: 16))),
                )
              else
                SliverList.builder(
                  itemCount: c.queue.length,
                  itemBuilder: (_, i) {
                    final lead = c.queue[i];
                    final s = stageByKey[lead.status];
                    final isNew = lead.lastActionAt == null || lead.lastActionAt!.isEmpty;
                    return AgentLeadCard(
                      lead: lead,
                      stageLabel: s?.labelAr,
                      stageColor: s?.color,
                      subtitle: isNew ? 'جديد · متكلمش قبل كده' : null,
                      subtitleColor: isNew ? AppColors.neonLimeDark : null,
                      onCall: () => _callOne(context, c, lead),
                    );
                  },
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 96)),
            ],
          ),
        ),
        if (c.queue.isNotEmpty)
          PositionedDirectional(
            start: 16,
            end: 16,
            bottom: 16,
            child: SizedBox(
              height: 60,
              child: FilledButton.icon(
                onPressed: () => _startCalling(context, c),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.neonLimeDark,
                  foregroundColor: const Color(0xFF142407),
                  elevation: 4,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                ),
                icon: const Icon(LucideIcons.phoneCall, size: 24),
                label: Text(
                  c.resumeLeadId != null && c.selectedStage == null && c.queue.any((l) => l.id == c.resumeLeadId)
                      ? 'كمّل الاتصال (${c.queue.length})'
                      : 'ابدأ الاتصال (${c.queue.length})',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/stage_note_guard.dart';
import '../../../core/utils/tr.dart';
import '../../../core/utils/whatsapp_utils.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/last_call_info.dart';
import '../../../data/models/lead_model.dart';
import '../../../state/leads_provider.dart';
import '../edit_lead_screen.dart';
import 'log_call_dialog.dart';
import 'quick_note_dialog.dart';
import 'status_change_sheet.dart';

enum _CardMenu { brochure, replied, noAnswer, edit, delete }

/// Lead summary card. Hierarchy: identity (name, phone) -> stage + urgency ->
/// quiet meta (project, budget, owner, source, follow-up) -> primary actions.
class LeadCard extends StatelessWidget {
  final LeadModel lead;
  final VoidCallback onTap;
  final EdgeInsetsGeometry margin;

  const LeadCard({
    super.key,
    required this.lead,
    required this.onTap,
    this.margin = const EdgeInsets.only(bottom: 12),
  });

  static const Color _onNeon = Color(0xFF142407);
  static const Color _amber = Color(0xFFF59E0B);
  static const Color _red = Color(0xFFEF4444);
  static const Color _wa = Color(0xFF25D366);

  Future<void> _makeCall(BuildContext context) async {
    await LogCallDialog.dialAndTrack(context, lead: lead);
  }

  Future<void> _openWhatsApp(BuildContext context) async {
    final launched = await WhatsAppUtils.openWhatsAppChat(
      context,
      phone: lead.phone,
    );
    if (launched && context.mounted) {
      LogCallDialog.show(context, lead: lead, initialChannel: 'WhatsApp');
    }
  }

  void _logInteractionChip(BuildContext context, String responseType) {
    context.read<LeadsProvider>().addNote(
          lead.id,
          'Interaction recorded: $responseType',
        );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Marked as "$responseType" for ${lead.name}'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  String get _initials {
    final parts = lead.name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).take(2);
    final s = parts.map((e) => e[0].toUpperCase()).join();
    return s.isEmpty ? '#' : s;
  }

  /// Short relative time for the "last call" line.
  static String _ago(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 1) return tr('just now', 'الآن');
    if (diff.inMinutes < 60) return tr('${diff.inMinutes}m ago', 'منذ ${diff.inMinutes} د');
    if (diff.inHours < 24) return tr('${diff.inHours}h ago', 'منذ ${diff.inHours} س');
    if (diff.inDays < 7) return tr('${diff.inDays}d ago', 'منذ ${diff.inDays} يوم');
    return '${at.day}/${at.month}';
  }

  void _changeStatus(BuildContext context) {
    final provider = context.read<LeadsProvider>();
    StatusChangeSheet.show(
      context,
      currentStatus: lead.status,
      onSelectStatus: (newStatus) {
        StageNoteGuard.run(
          context,
          leadId: lead.id,
          leadName: lead.name,
          newStage: newStatus,
          apply: () => provider.updateStatus(lead.id, newStatus),
        );
      },
    );
  }

  void _addNote(BuildContext context) {
    final provider = context.read<LeadsProvider>();
    QuickNoteDialog.show(
      context,
      leadName: lead.name,
      onSaveNote: (note) => provider.addNote(lead.id, note),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Surf.dark(context);
    final text = Surf.text(context);
    final sub = Surf.subtext(context);
    final statusColors = AppColors.getStatusColors(lead.status, isDark: isDark);

    final hasBudget = lead.budgetMax != null || lead.budgetMin != null;
    final isHighNet = (lead.budgetMax ?? 0) >= 4000000 || (lead.budgetMin ?? 0) >= 3000000;
    final overdue = AppDateUtils.isOverdue(lead.followUpDue);
    final dueToday = lead.actionTakenToday || AppDateUtils.isDueToday(lead.followUpDue);
    final projectLine = [
      if (lead.project?.isNotEmpty == true) lead.project!,
      if (lead.propertyType?.isNotEmpty == true) lead.propertyType!,
    ].join(' · ');

    return RepaintBoundary(
      child: PremiumCard(
        margin: margin,
        padding: const EdgeInsets.fromLTRB(14, 14, 6, 10),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Identity row
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: statusColors.bg,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    _initials,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: statusColors.text),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lead.name.isNotEmpty ? lead.name : 'Unknown Contact',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: text, letterSpacing: -0.1),
                      ),
                      if (lead.phone.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            lead.phone,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: sub,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                _buildMenu(context, sub),
              ],
            ),
            const SizedBox(height: 10),

            // Stage + urgency
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  InkWell(
                    onTap: () => _changeStatus(context),
                    borderRadius: BorderRadius.circular(999),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 32),
                      child: Container(
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          color: statusColors.bg,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: statusColors.text.withAlpha(70)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              lead.status,
                              style: TextStyle(color: statusColors.text, fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(width: 4),
                            Icon(LucideIcons.chevronDown, size: 12, color: statusColors.text),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (overdue)
                    const StatusPill('Overdue', color: _red, icon: LucideIcons.clock)
                  else if (dueToday)
                    const StatusPill('Action Today', color: _amber, icon: LucideIcons.clock),
                  if (isHighNet) const StatusPill('High Net', color: _amber),
                  // Lead has picked up at least one call.
                  if (context.select<LeadsProvider, bool>((p) => p.isAnswered(lead.id)))
                    const StatusPill('تم الرد', color: Color(0xFF3B82F6)),
                ],
              ),
            ),

            // Quiet secondary meta
            if (projectLine.isNotEmpty || hasBudget) ...[
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Row(
                  children: [
                    if (hasBudget) ...[
                      Text(
                        CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax),
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: text),
                      ),
                      if (projectLine.isNotEmpty) Text('  ·  ', style: TextStyle(fontSize: 12, color: sub)),
                    ],
                    if (projectLine.isNotEmpty)
                      Expanded(
                        child: Text(
                          projectLine,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12.5, color: sub),
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Row(
                children: [
                  Icon(
                    LucideIcons.calendarClock,
                    size: 13,
                    color: overdue ? _red : sub,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    lead.followUpDue != null
                        ? 'Next: ${AppDateUtils.formatFollowUpShort(lead.followUpDue)}'
                        : 'No follow-up scheduled',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: overdue ? FontWeight.w700 : FontWeight.w500,
                      color: overdue ? _red : sub,
                    ),
                  ),
                  const Spacer(),
                  if (lead.assignedToName?.isNotEmpty == true) ...[
                    Icon(LucideIcons.user, size: 12, color: sub),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        lead.assignedToName!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: sub),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (lead.source?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 4, right: 8),
                child: Row(
                  children: [
                    Icon(LucideIcons.globe, size: 12, color: sub),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        lead.source!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: sub),
                      ),
                    ),
                  ],
                ),
              ),
            // Last call logged for this lead, visible without opening the lead.
            Builder(
              builder: (context) {
                final last = context.select<LeadsProvider, LastCallInfo?>((p) => p.lastCallFor(lead.id));
                if (last == null) return const SizedBox.shrink();
                final missed = last.direction == 'missed';
                final color = missed ? _red : (isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569));
                return Padding(
                  padding: const EdgeInsets.only(top: 6, right: 8),
                  child: Row(
                    children: [
                      Icon(
                        missed
                            ? LucideIcons.phoneMissed
                            : (last.direction == 'incoming' ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing),
                        size: 12,
                        color: color,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '${tr('Last call', 'آخر مكالمة')}: ${last.outcome}'
                          '${last.durationSeconds > 0 ? ' • ${AppDateUtils.formatDuration(last.durationSeconds)}' : ''}'
                          ' • ${_ago(last.at)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
                        ),
                      ),
                      if (last.isAuto) const StatusPill('AUTO', color: Color(0xFF3B82F6)),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 10),

            // Primary actions (48dp)
            Row(
              children: [
                Expanded(
                  child: _ActionButton(
                    label: 'Call',
                    icon: LucideIcons.phoneCall,
                    background: AppColors.neonLime,
                    foreground: _onNeon,
                    onTap: () => _makeCall(context),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ActionButton(
                    label: 'WhatsApp',
                    icon: LucideIcons.messageCircle,
                    background: _wa.withAlpha(isDark ? 38 : 28),
                    foreground: isDark ? _wa : const Color(0xFF15803D),
                    onTap: () => _openWhatsApp(context),
                  ),
                ),
                const SizedBox(width: 2),
                SizedBox(
                  width: 48,
                  height: 48,
                  child: IconButton(
                    tooltip: 'Add note',
                    onPressed: () => _addNote(context),
                    icon: Icon(LucideIcons.notebookPen, size: 19, color: Surf.accent(context)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenu(BuildContext context, Color sub) {
    return PopupMenuButton<_CardMenu>(
      tooltip: 'More actions',
      padding: EdgeInsets.zero,
      iconSize: 20,
      icon: Icon(LucideIcons.ellipsisVertical, size: 20, color: sub),
      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
      onSelected: (v) {
        switch (v) {
          case _CardMenu.brochure:
            _logInteractionChip(context, 'Sent Brochure');
          case _CardMenu.replied:
            _logInteractionChip(context, 'Replied');
          case _CardMenu.noAnswer:
            _logInteractionChip(context, 'No Answer');
          case _CardMenu.edit:
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => EditLeadScreen(lead: lead)),
            );
          case _CardMenu.delete:
            _showDeleteDialog(context);
        }
      },
      itemBuilder: (_) => const [
        PopupMenuItem(
          value: _CardMenu.brochure,
          child: _MenuRow(LucideIcons.fileText, 'Sent Brochure', Color(0xFF38BDF8)),
        ),
        PopupMenuItem(
          value: _CardMenu.replied,
          child: _MenuRow(LucideIcons.thumbsUp, 'Replied', Color(0xFF10B981)),
        ),
        PopupMenuItem(
          value: _CardMenu.noAnswer,
          child: _MenuRow(LucideIcons.phoneOff, 'No Answer', Color(0xFFF59E0B)),
        ),
        PopupMenuDivider(),
        PopupMenuItem(
          value: _CardMenu.edit,
          child: _MenuRow(LucideIcons.pencil, 'Edit lead', null),
        ),
        PopupMenuItem(
          value: _CardMenu.delete,
          child: _MenuRow(LucideIcons.trash2, 'Delete lead', Color(0xFFEF4444)),
        ),
      ],
    );
  }

  Future<void> _showDeleteDialog(BuildContext context) async {
    final provider = context.read<LeadsProvider>();
    final ok = await confirmAction(
      context,
      title: 'Delete Lead',
      message: 'Are you sure you want to delete ${lead.name}?',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (ok) provider.deleteLead(lead.id);
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  const _MenuRow(this.icon, this.label, this.color);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color ?? Surf.subtext(context)),
        const SizedBox(width: 10),
        Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: color)),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color background;
  final Color foreground;
  final VoidCallback onTap;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.background,
    required this.foreground,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          height: 48,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: foreground),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: foreground),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

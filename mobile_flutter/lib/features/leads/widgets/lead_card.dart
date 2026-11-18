import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_utils.dart';
import '../../../core/utils/phone_utils.dart';
import '../../../core/utils/stage_note_guard.dart';
import '../../../core/utils/tr.dart';
import '../../../core/utils/whatsapp_utils.dart';
import '../../../core/widgets/premium.dart';
import '../../../data/models/last_call_info.dart';
import '../../../data/models/lead_model.dart';
import '../../../state/auth_provider.dart';
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
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final overdue = AppDateUtils.isOverdue(lead.followUpDue);
    final dueToday = AppDateUtils.isDueToday(lead.followUpDue);
    final hasDue = lead.followUpDue?.isNotEmpty == true;
    final dueColor = overdue ? p.danger : (dueToday ? p.accent : p.subtext);
    final tone = AppColors.stageTone(lead.status, isDark: Surf.dark(context));
    final meta = [
      if (lead.project?.isNotEmpty == true) lead.project!,
      if (lead.budgetMax != null || lead.budgetMin != null) CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax),
      if (lead.assignedToName?.isNotEmpty == true) lead.assignedToName!,
    ].join(' · ');

    return RepaintBoundary(
      child: PremiumCard(
        margin: margin,
        padding: EdgeInsets.zero,
        onTap: onTap,
        borderColor: overdue ? p.danger.withAlpha(90) : null,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, 0),
            child: Row(children: [
              // Avatar tinted with the stage colour; green dot = worked on today.
              Stack(clipBehavior: Clip.none, children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(AppRadius.sm)),
                  child: Text(_initials, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: tone.text)),
                ),
                if (lead.actionTakenToday)
                  PositionedDirectional(
                    end: -2,
                    bottom: -2,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(color: p.success, shape: BoxShape.circle, border: Border.all(color: p.card, width: 2)),
                    ),
                  ),
              ]),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(lead.name.isNotEmpty ? lead.name : tr('No name', 'بدون اسم'), maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleMedium),
                  if (lead.phone.isNotEmpty)
                    Row(children: [
                      Flexible(
                        child: Text(lead.phone,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textDirection: TextDirection.ltr,
                            style: t.bodySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                      ),
                      // Non-Egyptian numbers are tagged "International" (with the country code when known).
                      if (PhoneUtils.isInternational(lead.phone)) ...[
                        const SizedBox(width: AppSpacing.sm),
                        _IntlTag(code: PhoneUtils.countryCodeOf(lead.phone)),
                      ],
                    ]),
                ]),
              ),
              _buildMenu(context, p.subtext),
            ]),
          ),
          // Stage (tap to change) + next action
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Semantics(
                button: true,
                label: tr('Change stage', 'غيّر المرحلة'),
                child: InkWell(
                  onTap: () => _changeStatus(context),
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 36),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      StatusPill(lead.status, large: true),
                      Icon(LucideIcons.chevronDown, size: 14, color: p.subtext),
                    ]),
                  ),
                ),
              ),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(overdue ? LucideIcons.alarmClock : LucideIcons.calendarClock, size: 14, color: dueColor),
                const SizedBox(width: 4),
                Text(
                  hasDue
                      ? (overdue ? '${tr('Late', 'متأخر')} · ' : '') + AppDateUtils.formatFollowUpShort(lead.followUpDue)
                      : tr('No next action', 'مفيش إجراء جاي'),
                  style: t.labelMedium?.copyWith(color: dueColor, fontWeight: overdue || dueToday ? FontWeight.w700 : FontWeight.w500),
                ),
              ]),
              if (context.select<LeadsProvider, bool>((pr) => pr.isAnswered(lead.id))) StatusPill(tr('Answered', 'تم الرد'), color: p.info),
            ]),
          ),
          if (meta.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, 0),
              child: Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodySmall),
            ),
          // Last call, visible without opening the lead.
          Builder(builder: (context) {
            final last = context.select<LeadsProvider, LastCallInfo?>((pr) => pr.lastCallFor(lead.id));
            if (last == null) return const SizedBox.shrink();
            final missed = last.direction == 'missed';
            final c = missed ? p.danger : p.subtext;
            final dur = last.durationSeconds > 0 ? ' · ${AppDateUtils.formatDuration(last.durationSeconds)}' : '';
            return Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 6, AppSpacing.lg, 0),
              child: Row(children: [
                Icon(missed ? LucideIcons.phoneMissed : (last.direction == 'incoming' ? LucideIcons.phoneIncoming : LucideIcons.phoneOutgoing), size: 12, color: c),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${last.outcome}$dur · ${_ago(last.at)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodySmall?.copyWith(color: c, fontWeight: FontWeight.w600),
                  ),
                ),
              ]),
            );
          }),
          const SizedBox(height: AppSpacing.sm),
          Divider(height: 1, color: p.border),
          // One-tap actions
          Row(children: [
            Expanded(child: QuickAction(icon: LucideIcons.phone, label: tr('Call', 'اتصال'), color: p.accent, onTap: () => _makeCall(context))),
            Expanded(child: QuickAction(icon: LucideIcons.messageCircle, label: 'WhatsApp', color: p.whatsapp, onTap: () => _openWhatsApp(context))),
            Expanded(child: QuickAction(icon: LucideIcons.notebookPen, label: tr('Note', 'نوتة'), onTap: () => _addNote(context))),
          ]),
        ]),
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
        if (!(context.read<AuthProvider>().profile?.isLimitedAdmin ?? false))
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

/// Small "International" tag shown next to a non-Egyptian number.
class _IntlTag extends StatelessWidget {
  final String? code;
  const _IntlTag({required this.code});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: p.info.withAlpha(30), borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(LucideIcons.globe, size: 11, color: p.info),
        const SizedBox(width: 3),
        Text(
          code == null ? tr('Intl', 'دولي') : '${tr('Intl', 'دولي')} +$code',
          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: p.info),
        ),
      ]),
    );
  }
}

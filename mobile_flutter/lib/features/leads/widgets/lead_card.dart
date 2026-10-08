import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/currency_formatter.dart';
import '../../../core/utils/date_utils.dart';
import '../../../data/models/lead_model.dart';
import '../../../state/leads_provider.dart';
import '../edit_lead_screen.dart';
import 'log_call_dialog.dart';
import 'quick_note_dialog.dart';
import 'status_change_sheet.dart';

class LeadCard extends StatelessWidget {
  final LeadModel lead;
  final VoidCallback onTap;

  const LeadCard({
    super.key,
    required this.lead,
    required this.onTap,
  });

  Future<void> _makeCall(BuildContext context) async {
    final cleanPhone = lead.phone.replaceAll(RegExp(r'\s+'), '');
    final uri = Uri.parse('tel:$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      if (context.mounted) {
        LogCallDialog.show(context, lead: lead, initialChannel: 'Call');
      }
    }
  }

  Future<void> _openWhatsApp(BuildContext context) async {
    final cleanPhone = lead.phone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse('https://wa.me/$cleanPhone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (context.mounted) {
        LogCallDialog.show(context, lead: lead, initialChannel: 'WhatsApp');
      }
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

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final statusColors = AppColors.getStatusColors(lead.status, isDark: isDark);
    final provider = context.read<LeadsProvider>();

    final initial = lead.name.trim().isNotEmpty ? lead.name.trim()[0].toUpperCase() : 'L';
    final leadShortId = lead.id.length >= 6 ? lead.id.substring(0, 6).toUpperCase() : lead.id.toUpperCase();

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(isDark ? 30 : 10),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Top Row: Avatar Badge + Lead Name/ID + Status Badge + Menu
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Avatar Badge with Initial
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: AppColors.neonLime,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.neonLime.withAlpha(60),
                        blurRadius: 6,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      initial,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF142407),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),

                // Name and Lead Short ID
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              lead.name.isNotEmpty ? lead.name : 'Unknown Contact',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                            decoration: BoxDecoration(
                              color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '#$leadShortId',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        lead.phone,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),

                // Status Badge Dropdown Trigger
                GestureDetector(
                  onTap: () {
                    StatusChangeSheet.show(
                      context,
                      currentStatus: lead.status,
                      onSelectStatus: (newStatus) {
                        provider.updateStatus(lead.id, newStatus);
                      },
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColors.bg,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          lead.status,
                          style: TextStyle(
                            color: statusColors.text,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(LucideIcons.chevronDown, size: 12, color: statusColors.text),
                      ],
                    ),
                  ),
                ),

                // Edit / Delete Popup Menu
                PopupMenuButton<String>(
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(maxWidth: 32),
                  icon: Icon(
                    LucideIcons.moreVertical,
                    size: 16,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                  onSelected: (val) {
                    if (val == 'edit') {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => EditLeadScreen(lead: lead)),
                      );
                    } else if (val == 'delete') {
                      _showDeleteDialog(context, provider);
                    }
                  },
                  itemBuilder: (context) => [
                    const PopupMenuItem(
                      value: 'edit',
                      child: Row(
                        children: [
                          Icon(LucideIcons.pencil, size: 15),
                          SizedBox(width: 8),
                          Text('Edit Lead', style: TextStyle(fontSize: 13)),
                        ],
                      ),
                    ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(LucideIcons.trash2, size: 15, color: Color(0xFFEF4444)),
                          SizedBox(width: 8),
                          Text('Delete Lead', style: TextStyle(fontSize: 13, color: Color(0xFFEF4444))),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),

            // ── Metadata Row: Project, Budget, Property Type
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                if (lead.project != null && lead.project!.isNotEmpty)
                  _buildTag(
                    icon: LucideIcons.building2,
                    text: lead.project!,
                    isDark: isDark,
                  ),
                if (lead.budgetMax != null || lead.budgetMin != null)
                  _buildTag(
                    icon: LucideIcons.coins,
                    text: CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax),
                    isDark: isDark,
                  ),
                if (lead.propertyType != null && lead.propertyType!.isNotEmpty)
                  _buildTag(
                    icon: LucideIcons.home,
                    text: lead.propertyType!,
                    isDark: isDark,
                  ),
              ],
            ),
            const SizedBox(height: 10),

            // ── Interaction Response Chips: Sent, Replied, No Reply
            Row(
              children: [
                Text(
                  'Response: ',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
                const SizedBox(width: 4),
                _buildInteractionChip(
                  context,
                  label: 'Sent',
                  icon: LucideIcons.send,
                  color: const Color(0xFF0284C7),
                  isDark: isDark,
                ),
                const SizedBox(width: 6),
                _buildInteractionChip(
                  context,
                  label: 'Replied',
                  icon: LucideIcons.messageSquareCheck,
                  color: const Color(0xFF16A34A),
                  isDark: isDark,
                ),
                const SizedBox(width: 6),
                _buildInteractionChip(
                  context,
                  label: 'No Reply',
                  icon: LucideIcons.phoneOff,
                  color: const Color(0xFFEF4444),
                  isDark: isDark,
                ),
              ],
            ),
            const SizedBox(height: 10),

            // ── Follow-up & Scheduled Timestamps Bar
            Row(
              children: [
                if (lead.actionTakenToday) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF11261A) : const Color(0xFFDCFCE7),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LucideIcons.check, size: 12, color: Color(0xFF16A34A)),
                        SizedBox(width: 4),
                        Text(
                          'Action taken today',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF16A34A),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                if (lead.followUpDue != null) ...[
                  Icon(
                    LucideIcons.calendarClock,
                    size: 13,
                    color: AppDateUtils.isOverdue(lead.followUpDue)
                        ? AppColors.alertRed
                        : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    AppDateUtils.formatFollowUpShort(lead.followUpDue),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppDateUtils.isOverdue(lead.followUpDue)
                          ? AppColors.alertRed
                          : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
                    ),
                  ),
                ],
                const Spacer(),
                if (lead.assignedToName != null && lead.assignedToName!.isNotEmpty)
                  Text(
                    lead.assignedToName!,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Divider(
              height: 1,
              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
            ),
            const SizedBox(height: 8),

            // ── Quick Actions: Call, WhatsApp, + Add Note, Log Touch
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Call
                _buildActionButton(
                  icon: LucideIcons.phone,
                  label: 'Call',
                  color: AppColors.neonLime,
                  onTap: () => _makeCall(context),
                  isDark: isDark,
                ),
                // WhatsApp
                _buildActionButton(
                  icon: LucideIcons.messageCircle,
                  label: 'WhatsApp',
                  color: const Color(0xFF25D366),
                  onTap: () => _openWhatsApp(context),
                  isDark: isDark,
                ),
                // + Add Note
                _buildActionButton(
                  icon: LucideIcons.fileText,
                  label: '+ Add Note',
                  color: isDark ? Colors.white70 : Colors.black87,
                  onTap: () {
                    QuickNoteDialog.show(
                      context,
                      leadName: lead.name,
                      onSaveNote: (note) => provider.addNote(lead.id, note),
                    );
                  },
                  isDark: isDark,
                ),
                // Log Touchpoint
                _buildActionButton(
                  icon: LucideIcons.plusCircle,
                  label: 'Log Touch',
                  color: isDark ? AppColors.neonLime : AppColors.primary,
                  onTap: () => LogCallDialog.show(context, lead: lead),
                  isDark: isDark,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInteractionChip(
    BuildContext context, {
    required String label,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return InkWell(
      onTap: () => _logInteractionChip(context, label),
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: color.withAlpha(isDark ? 30 : 18),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: color.withAlpha(70)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 10, color: color),
            const SizedBox(width: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTag({
    required IconData icon,
    required String text,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: isDark ? Colors.white70 : Colors.black87,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteDialog(BuildContext context, LeadsProvider provider) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Lead'),
        content: Text('Are you sure you want to delete ${lead.name}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await provider.deleteLead(lead.id);
            },
            child: const Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ),
        ],
      ),
    );
  }
}

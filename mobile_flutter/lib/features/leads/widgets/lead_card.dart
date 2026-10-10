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

    final isHighNet = (lead.budgetMax ?? 0) >= 4000000 || (lead.budgetMin ?? 0) >= 3000000;
    final isActionToday = lead.actionTakenToday || AppDateUtils.isDueToday(lead.followUpDue);
    final isVerified = lead.phone.isNotEmpty;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF161920) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 80 : 15),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Ambient Linear Accent Border Top (from Stitch Luxury Leads Hub)
            Container(
              height: 3,
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.neonLime,
                    Color(0xFF65A30D),
                    Colors.transparent,
                  ],
                  stops: [0.0, 0.45, 1.0],
                ),
              ),
            ),

            InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // ── 1. Top Identity Row: Avatar with pulse, Name, Verified & High Net Tags, Edit/Delete
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Avatar Icon with Pulse Dot
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isDark ? const Color(0xFF2C3240) : const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: const Center(
                                child: Icon(
                                  LucideIcons.user,
                                  size: 20,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ),
                            // Active Pulse Dot
                            Positioned(
                              top: -2,
                              right: -2,
                              child: Container(
                                width: 9,
                                height: 9,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: AppColors.neonLime,
                                  border: Border.all(
                                    color: isDark ? const Color(0xFF161920) : Colors.white,
                                    width: 1.5,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: AppColors.neonLime.withAlpha(180),
                                      blurRadius: 6,
                                      spreadRadius: 1,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: 10),

                        // Name, Verified Pill, High Net / VIP Tag
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      lead.name.isNotEmpty ? lead.name : 'Unknown Contact',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  if (isVerified)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF10B981).withAlpha(25),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: const Color(0xFF10B981).withAlpha(80),
                                        ),
                                      ),
                                      child: const Text(
                                        'Verified',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF10B981),
                                        ),
                                      ),
                                    ),
                                  if (isHighNet) ...[
                                    const SizedBox(width: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF59E0B).withAlpha(25),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: const Color(0xFFF59E0B).withAlpha(80),
                                        ),
                                      ),
                                      child: const Text(
                                        'High Net',
                                        style: TextStyle(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                          color: Color(0xFFF59E0B),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 3),

                              // Project / Unit text
                              if (lead.project?.isNotEmpty == true || lead.propertyType?.isNotEmpty == true)
                                Row(
                                  children: [
                                    const Icon(LucideIcons.building, size: 12, color: AppColors.neonLime),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        lead.project?.isNotEmpty == true
                                            ? '${lead.project} ${lead.propertyType != null ? "(${lead.propertyType})" : ""}'
                                            : (lead.propertyType ?? ''),
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w500,
                                          color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569),
                                        ),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                              const SizedBox(height: 3),

                              // Price + Action Today status line
                              Row(
                                children: [
                                  if (lead.budgetMax != null || lead.budgetMin != null)
                                    Text(
                                      CurrencyFormatter.formatRange(lead.budgetMin, lead.budgetMax),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.neonLime,
                                      ),
                                    ),
                                  if (isActionToday) ...[
                                    if (lead.budgetMax != null || lead.budgetMin != null)
                                      Padding(
                                        padding: const EdgeInsets.symmetric(horizontal: 6),
                                        child: Text(
                                          '•',
                                          style: TextStyle(
                                            color: isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8),
                                          ),
                                        ),
                                      ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF59E0B).withAlpha(20),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(LucideIcons.clock, size: 10, color: Color(0xFFF59E0B)),
                                          SizedBox(width: 3),
                                          Text(
                                            'Action Today',
                                            style: TextStyle(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFFF59E0B),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),

                        // Action Icons (Edit & Delete)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            InkWell(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => EditLeadScreen(lead: lead)),
                                );
                              },
                              borderRadius: BorderRadius.circular(8),
                              child: Padding(
                                padding: const EdgeInsets.all(5),
                                child: Icon(
                                  LucideIcons.pencil,
                                  size: 15,
                                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                ),
                              ),
                            ),
                            InkWell(
                              onTap: () => _showDeleteDialog(context, provider),
                              borderRadius: BorderRadius.circular(8),
                              child: const Padding(
                                padding: EdgeInsets.all(5),
                                child: Icon(
                                  LucideIcons.trash2,
                                  size: 15,
                                  color: Color(0xFFEF4444),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // ── 2. Middle Attribution & Pipeline Badges
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        // Status Selector Badge
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
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: statusColors.bg,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: statusColors.text.withAlpha(80)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  lead.status,
                                  style: TextStyle(
                                    color: statusColors.text,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Icon(LucideIcons.chevronDown, size: 11, color: statusColors.text),
                              ],
                            ),
                          ),
                        ),

                        // Lead Source / Campaign attribution
                        if (lead.source?.isNotEmpty == true)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isDark ? const Color(0xFF2C3240) : const Color(0xFFE2E8F0),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(LucideIcons.globe, size: 10, color: Color(0xFF38BDF8)),
                                const SizedBox(width: 4),
                                Text(
                                  lead.source!,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF475569),
                                  ),
                                ),
                              ],
                            ),
                          ),

                        // Broker attribution tag
                        if (lead.assignedToName?.isNotEmpty == true)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isDark ? const Color(0xFF2C3240) : const Color(0xFFE2E8F0),
                              ),
                            ),
                            child: Text(
                              'Broker: ${lead.assignedToName}',
                              style: TextStyle(
                                fontSize: 10,
                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // ── 3. Primary Action Buttons (Tactile Gradient Call & WhatsApp)
                    Row(
                      children: [
                        // Call Now Button
                        Expanded(
                          child: InkWell(
                            onTap: () => _makeCall(context),
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 9),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [AppColors.neonLime, Color(0xFF65A30D)],
                                ),
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.neonLime.withAlpha(90),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(LucideIcons.phoneCall, size: 14, color: Color(0xFF142407)),
                                  SizedBox(width: 6),
                                  Text(
                                    'Call Now',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFF142407),
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),

                        // WhatsApp Button
                        Expanded(
                          child: InkWell(
                            onTap: () => _openWhatsApp(context),
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 9),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [Color(0xFF10B981), Color(0xFF25D366)],
                                ),
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF25D366).withAlpha(70),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(LucideIcons.messageCircle, size: 14, color: Colors.white),
                                  SizedBox(width: 6),
                                  Text(
                                    'WhatsApp',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // ── 4. Disposition Logging Bar (Sent Brochure, Replied, No Answer)
                    Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E222B).withAlpha(180) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isDark ? const Color(0xFF282D38) : const Color(0xFFE2E8F0),
                        ),
                      ),
                      child: Row(
                        children: [
                          _buildDispositionButton(
                            context,
                            label: 'Sent Brochure',
                            icon: LucideIcons.fileText,
                            color: const Color(0xFF38BDF8),
                            isDark: isDark,
                          ),
                          _buildDispositionButton(
                            context,
                            label: 'Replied',
                            icon: LucideIcons.thumbsUp,
                            color: const Color(0xFF10B981),
                            isDark: isDark,
                          ),
                          _buildDispositionButton(
                            context,
                            label: 'No Answer',
                            icon: LucideIcons.phoneOff,
                            color: const Color(0xFFEF4444),
                            isDark: isDark,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),

                    // ── 5. Footer: Next Follow-up & Quick Note
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(LucideIcons.calendarClock, size: 13, color: AppColors.neonLime),
                            const SizedBox(width: 5),
                            Text(
                              'Next: ',
                              style: TextStyle(
                                fontSize: 11,
                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                              ),
                            ),
                            if (lead.followUpDue != null)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppDateUtils.isOverdue(lead.followUpDue)
                                      ? const Color(0xFFEF4444).withAlpha(25)
                                      : (isDark ? const Color(0xFF1E222B) : const Color(0xFFF1F5F9)),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: AppDateUtils.isOverdue(lead.followUpDue)
                                        ? const Color(0xFFEF4444).withAlpha(70)
                                        : (isDark ? const Color(0xFF2C3240) : const Color(0xFFE2E8F0)),
                                  ),
                                ),
                                child: Text(
                                  AppDateUtils.formatFollowUpShort(lead.followUpDue),
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: AppDateUtils.isOverdue(lead.followUpDue)
                                        ? const Color(0xFFEF4444)
                                        : (isDark ? const Color(0xFFE2E8F0) : const Color(0xFF334155)),
                                  ),
                                ),
                              )
                            else
                              Text(
                                'Not scheduled',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  color: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                                ),
                              ),
                          ],
                        ),

                        // Add Note Button
                        InkWell(
                          onTap: () {
                            QuickNoteDialog.show(
                              context,
                              leadName: lead.name,
                              onSaveNote: (note) => provider.addNote(lead.id, note),
                            );
                          },
                          borderRadius: BorderRadius.circular(6),
                          child: const Row(
                            children: [
                              Icon(LucideIcons.plusSquare, size: 13, color: AppColors.neonLime),
                              SizedBox(width: 4),
                              Text(
                                'Add Note',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDispositionButton(
    BuildContext context, {
    required String label,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Expanded(
      child: InkWell(
        onTap: () => _logInteractionChip(context, label),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 6),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 11, color: color),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                ),
              ),
            ],
          ),
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
            onPressed: () {
              Navigator.pop(ctx);
              provider.deleteLead(lead.id);
            },
            child: const Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ),
        ],
      ),
    );
  }
}

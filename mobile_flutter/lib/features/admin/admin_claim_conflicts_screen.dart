import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/admin_models.dart';
import '../../data/services/admin_service.dart';
import '../../state/auth_provider.dart';
import 'admin_ui.dart';

/// Audit log of rejected lead claims (lead_claim_conflicts). Admin/owner only,
/// enforced here and by RLS (SELECT policy = is_admin_or_owner_v2()).
/// Works embedded in the shell (no app bar) and when pushed standalone.
class AdminClaimConflictsScreen extends StatefulWidget {
  const AdminClaimConflictsScreen({super.key});

  @override
  State<AdminClaimConflictsScreen> createState() => _AdminClaimConflictsScreenState();
}

class _AdminClaimConflictsScreenState extends State<AdminClaimConflictsScreen> {
  final AdminService _service = AdminService();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthProvider>().profile;
    if (profile == null) return const SkeletonList();
    if (!profile.isAdmin) {
      return const AdminAccessDenied(message: 'Claim conflicts are visible to admins and owners only.');
    }
    return AdminLoader<List<AdminClaimConflict>>(
      loader: _service.getClaimConflicts,
      builder: (context, all, reload) {
        final q = _query.trim().toLowerCase();
        final list = q.isEmpty
            ? all
            : all
                .where((c) =>
                    c.leadName.toLowerCase().contains(q) ||
                    c.leadPhone.contains(q) ||
                    c.holderName.toLowerCase().contains(q) ||
                    c.requesterName.toLowerCase().contains(q))
                .toList();
        return [
          const SectionHeader(title: 'Claim conflicts', subtitle: 'Rejected attempts to take a lead another user already holds. Admins only'),
          AppSearchField(hint: 'Search lead, phone or user', onChanged: (v) => setState(() => _query = v)),
          const SizedBox(height: 12),
          if (list.isEmpty)
            AdminEmptyBlock(
              icon: LucideIcons.shieldCheck,
              title: all.isEmpty ? 'No conflicts logged' : 'No matching conflicts',
            )
          else
            for (final c in list)
              PremiumCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Icon(LucideIcons.shieldAlert, size: 18, color: AppColors.alertRed),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        c.leadName.isNotEmpty ? c.leadName : (c.leadPhone.isNotEmpty ? c.leadPhone : (c.leadId == null ? 'Lead (deleted)' : 'Lead')),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context)),
                      ),
                    ),
                    StatusPill(c.status, color: AppColors.alertRed),
                  ]),
                  if (c.leadPhone.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2, left: 26),
                      child: Text(c.leadPhone,
                          textDirection: TextDirection.ltr,
                          style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: kTabular)),
                    ),
                  const SizedBox(height: 10),
                  DetailRow('Held by', c.holderName),
                  DetailRow('Requested by', c.requesterName),
                  DetailRow('Action', AdminFmt.label(c.action)),
                  DetailRow('When', AdminFmt.dateTime(c.createdAt)),
                ]),
              ),
        ];
      },
    );
  }
}

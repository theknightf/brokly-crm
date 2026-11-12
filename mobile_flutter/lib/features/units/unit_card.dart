import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/units_service.dart' show UnitModel;
import '../projects/projects_common.dart';

/// Compact inventory card shared by the Units screen and project details.
class UnitCard extends StatelessWidget {
  final UnitModel unit;
  final bool showProject;
  final VoidCallback onTap;
  final ValueChanged<String>? onStatus;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  const UnitCard({
    super.key,
    required this.unit,
    required this.onTap,
    this.showProject = true,
    this.onStatus,
    this.onEdit,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final meta = [
      if (unit.unitType.isNotEmpty) unit.unitType,
      if (unit.area > 0) '${formatNumber(unit.area)} m²',
      if (unit.floor != 0) 'Floor ${unit.floor}',
    ].join(' · ');
    final hasMenu = onStatus != null || onEdit != null || onDelete != null;

    return PremiumCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        BucketImage(
          bucket: InventoryStorage.unitBucket,
          path: unit.imagePath,
          width: 68,
          height: 68,
          radius: 14,
          fallbackIcon: LucideIcons.image,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(unit.name.isEmpty ? 'Untitled unit' : unit.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context))),
              ),
              const SizedBox(width: 6),
              StatusPill(unit.status, color: moduleStatusColor(unit.status)),
              if (!hasMenu) const SizedBox(width: 8),
            ]),
            if (showProject && unit.projectName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(unit.projectName,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
              ),
            if (meta.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: tabularFigures)),
              ),
            const SizedBox(height: 6),
            Text(formatEgp(unit.price),
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: tabularFigures)),
          ]),
        ),
        if (hasMenu)
          PopupMenuButton<String>(
            tooltip: 'Unit actions',
            icon: Icon(LucideIcons.ellipsisVertical, size: 19, color: Surf.subtext(context)),
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            onSelected: (v) {
              if (v == 'edit') {
                onEdit?.call();
              } else if (v == 'delete') {
                onDelete?.call();
              } else if (v.startsWith('status:')) {
                onStatus?.call(v.substring(7));
              }
            },
            itemBuilder: (_) => [
              if (onStatus != null)
                for (final s in InventoryService.statuses)
                  if (s != unit.status)
                    PopupMenuItem(value: 'status:$s', height: 48, child: Text('Mark $s')),
              if (onEdit != null) const PopupMenuItem(value: 'edit', height: 48, child: Text('Edit unit')),
              if (onDelete != null)
                const PopupMenuItem(
                    value: 'delete', height: 48, child: Text('Delete unit', style: TextStyle(color: AppColors.alertRed))),
            ],
          ),
      ]),
    );
  }
}

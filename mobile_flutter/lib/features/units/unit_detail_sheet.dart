import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/services/inventory_service.dart';
import '../../data/services/units_service.dart' show UnitModel, UnitFileModel;
import '../projects/projects_common.dart';

enum UnitSheetAction { none, edit, delete, reserve }

class UnitSheetResult {
  final UnitSheetAction action;
  final bool filesChanged;
  const UnitSheetResult(this.action, {this.filesChanged = false});
}

/// Unit detail (bottom sheet): cover, key facts, payment plan, notes, files.
Future<UnitSheetResult?> showUnitDetailSheet(BuildContext context, UnitModel unit) {
  return showPremiumSheet<UnitSheetResult>(context, builder: (_) => _UnitDetail(unit: unit));
}

class _UnitDetail extends StatefulWidget {
  final UnitModel unit;
  const _UnitDetail({required this.unit});

  @override
  State<_UnitDetail> createState() => _UnitDetailState();
}

class _UnitDetailState extends State<_UnitDetail> {
  final _service = InventoryService();
  List<UnitFileModel>? _files;
  bool _filesError = false;
  bool _filesChanged = false;
  String? _deletingId;

  @override
  void initState() {
    super.initState();
    _loadFiles();
  }

  Future<void> _loadFiles() async {
    setState(() => _filesError = false);
    try {
      final f = await _service.fetchFiles(widget.unit.id);
      if (mounted) setState(() => _files = f);
    } catch (_) {
      if (mounted) {
        setState(() {
          _filesError = true;
          _files = [];
        });
      }
    }
  }

  Future<void> _openExternal(String? url) async {
    if (url == null || url.isEmpty) return;
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!ok && mounted) showModuleSnack(context, 'Could not open the file', error: true);
  }

  void _previewImage(UnitFileModel f) {
    final url = f.url;
    if (url == null) return;
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(children: [
          InteractiveViewer(
            child: Image.network(url, fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Padding(
                    padding: EdgeInsets.all(40), child: Icon(LucideIcons.image, color: Colors.white54, size: 40))),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: IconButton(
              tooltip: 'Close',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: () => Navigator.pop(ctx),
              icon: const Icon(LucideIcons.x, color: Colors.white),
            ),
          ),
        ]),
      ),
    );
  }

  Future<void> _deleteFile(UnitFileModel f) async {
    final ok = await confirmAction(context,
        title: 'Delete file?', message: '"${f.fileName}" will be permanently removed.', confirmLabel: 'Delete', destructive: true);
    if (!ok || !mounted) return;
    setState(() => _deletingId = f.id);
    try {
      await _service.deleteFile(f);
      _filesChanged = true;
      await _loadFiles();
    } catch (e) {
      if (mounted) showModuleSnack(context, friendlyError(e), error: true);
    } finally {
      if (mounted) setState(() => _deletingId = null);
    }
  }

  Widget _fact(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Surf.muted(context), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(label.toUpperCase(),
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Surf.subtext(context))),
        const SizedBox(height: 4),
        Text(value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 14.5, fontWeight: FontWeight.w700, color: Surf.text(context), fontFeatures: tabularFigures)),
      ]),
    );
  }

  Widget _fileTile(UnitFileModel f) {
    final busy = _deletingId == f.id;
    Widget visual;
    VoidCallback onTap;
    if (f.kind == 'image' && f.url != null) {
      visual = Image.network(f.url!,
          fit: BoxFit.cover,
          cacheWidth: 300,
          errorBuilder: (_, __, ___) => Icon(LucideIcons.image, color: Surf.subtext(context)));
      onTap = () => _previewImage(f);
    } else {
      final isPdf = f.kind == 'pdf';
      visual = Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(isPdf ? LucideIcons.fileText : (f.kind == 'video' ? LucideIcons.film : LucideIcons.image),
            color: Surf.subtext(context)),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: Text(f.fileName,
              maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 9.5, color: Surf.subtext(context))),
        ),
      ]);
      onTap = () => _openExternal(f.url);
    }
    return Stack(children: [
      Positioned.fill(
        child: Material(
          color: Surf.muted(context),
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: InkWell(onTap: onTap, child: Center(child: SizedBox.expand(child: visual))),
        ),
      ),
      Positioned(
        top: 0,
        right: 0,
        child: busy
            ? const Padding(padding: EdgeInsets.all(8), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
            : InkResponse(
                radius: 24,
                onTap: () => _deleteFile(f),
                child: Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                  child: const Icon(LucideIcons.trash2, size: 13, color: Colors.white),
                ),
              ),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final u = widget.unit;
    final statusColor = moduleStatusColor(u.status);
    final planParts = [
      if (u.downPaymentPct > 0) '${u.downPaymentPct.toStringAsFixed(u.downPaymentPct % 1 == 0 ? 0 : 1)}% down payment',
      if (u.installmentYears > 0) '${u.installmentYears} years installments',
      if (u.paymentPlan.isNotEmpty) u.paymentPlan,
    ];
    final facts = <(String, String)>[
      ('Type', u.unitType.isEmpty ? '—' : u.unitType),
      ('Area', u.area > 0 ? '${formatNumber(u.area)} m²' : '—'),
      ('Floor', u.floor != 0 ? '${u.floor}' : '—'),
      ('Status', u.status.isEmpty ? '—' : u.status),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Stack(children: [
          BucketImage(
            bucket: InventoryStorage.unitBucket,
            path: u.imagePath,
            width: double.infinity,
            height: 170,
            radius: 18,
            fallbackIcon: LucideIcons.building2,
          ),
          Positioned(top: 10, right: 10, child: StatusPill(u.status, color: statusColor)),
        ]),
        const SizedBox(height: 14),
        if (u.projectName.isNotEmpty)
          Text(u.projectName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Surf.accent(context))),
        Text(u.name.isEmpty ? 'Untitled unit' : u.name,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 2),
        Text(formatEgp(u.price),
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: tabularFigures)),
        const SizedBox(height: 14),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 2.6,
          children: [for (final f in facts) _fact(f.$1, f.$2)],
        ),
        if (planParts.isNotEmpty) ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.statusFollowingUp.withAlpha(Surf.dark(context) ? 36 : 26),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Payment plan',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.statusFollowingUp)),
              const SizedBox(height: 4),
              Text(planParts.join(' · '), style: TextStyle(fontSize: 13.5, color: Surf.text(context))),
            ]),
          ),
        ],
        if (u.notes.trim().isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(u.notes, style: TextStyle(fontSize: 13.5, height: 1.4, color: Surf.subtext(context))),
        ],
        const SizedBox(height: 18),
        Text('FILES${_files == null ? '' : ' (${_files!.length})'}',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: Surf.subtext(context))),
        const SizedBox(height: 8),
        if (_files == null)
          const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: LinearProgressIndicator(minHeight: 3))
        else if (_filesError)
          Row(children: [
            Expanded(child: Text('Could not load files.', style: TextStyle(color: Surf.subtext(context)))),
            TextButton(onPressed: _loadFiles, child: const Text('Retry')),
          ])
        else if (_files!.isEmpty)
          Text('No photos, videos or brochures yet. Add them from the website.',
              style: TextStyle(fontSize: 13, color: Surf.subtext(context)))
        else
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [for (final f in _files!) _fileTile(f)],
          ),
        const SizedBox(height: 20),
        Row(children: [
          if (u.status == 'Available') ...[
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: () => Navigator.pop(context, UnitSheetResult(UnitSheetAction.reserve, filesChanged: _filesChanged)),
                icon: const Icon(LucideIcons.badgeCheck, size: 17),
                label: const Text('Reserve'),
              ),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            flex: 2,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => Navigator.pop(context, UnitSheetResult(UnitSheetAction.edit, filesChanged: _filesChanged)),
              icon: const Icon(LucideIcons.pencil, size: 16),
              label: const Text('Edit'),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            width: 50,
            height: 50,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: AppColors.alertRed),
              onPressed: () => Navigator.pop(context, UnitSheetResult(UnitSheetAction.delete, filesChanged: _filesChanged)),
              child: const Icon(LucideIcons.trash2, size: 18),
            ),
          ),
        ]),
      ]),
    );
  }
}

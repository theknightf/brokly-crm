import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/import_history_models.dart';
import '../../data/services/import_history_service.dart';
import '../../state/auth_provider.dart';
import '../duplicates/widgets/dup_screen_frame.dart';

/// Web `/import-history`: read-only list of lead imports (`import_logs`) with status, counts and
/// the per-row error / duplicate report. Owner, admin, branch manager and team leader only; team
/// leaders see imports by their team. Starting an import and downloading the original file stay on
/// the website.
class ImportHistoryScreen extends StatefulWidget {
  const ImportHistoryScreen({super.key});

  @override
  State<ImportHistoryScreen> createState() => _ImportHistoryScreenState();
}

class _ImportHistoryScreenState extends State<ImportHistoryScreen> {
  static const _statuses = ['All', 'Processing', 'Completed', 'Partially Imported', 'Failed'];
  static const _pageSize = 20;

  final _service = ImportHistoryService();
  final _searchCtl = TextEditingController();
  Timer? _debounce;

  List<ImportLogModel> _logs = [];
  int _total = 0;
  ImportStats _stats = const ImportStats();
  List<ImportUploader> _uploaders = [];
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _seq = 0;
  bool _started = false;

  String _search = '';
  String _status = 'All';
  String? _uploader;
  DateTime? _from;
  DateTime? _to;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (canViewImportHistory(context.read<AuthProvider>().profile?.role)) {
      _load();
    } else {
      _loading = false;
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtl.dispose();
    super.dispose();
  }

  String? _ymd(DateTime? d) => d == null ? null : DateFormat('yyyy-MM-dd').format(d);

  Future<ImportHistoryPage> _fetch(int page) {
    final p = context.read<AuthProvider>().profile;
    return _service.fetch(
      role: p?.role ?? '',
      userId: p?.id ?? '',
      teamId: p?.teamId,
      page: page,
      pageSize: _pageSize,
      search: _search,
      status: _status,
      uploadedBy: _uploader,
      from: _ymd(_from),
      to: _ymd(_to),
    );
  }

  Future<void> _load({bool silent = false}) async {
    final seq = ++_seq;
    if (!silent) setState(() => _loading = true);
    try {
      final r = await _fetch(1);
      if (!mounted || seq != _seq) return;
      setState(() {
        _logs = r.logs;
        _total = r.total;
        _stats = r.stats;
        if (r.uploaders.isNotEmpty || _uploaders.isEmpty) _uploaders = r.uploaders;
        _page = 1;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = e is ImportHistoryException ? e.message : 'Failed to load import history';
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _logs.length >= _total) return;
    final seq = _seq;
    setState(() => _loadingMore = true);
    try {
      final r = await _fetch(_page + 1);
      if (!mounted || seq != _seq) return;
      setState(() {
        _logs = [..._logs, ...r.logs];
        _total = r.total;
        _page += 1;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load more imports'), behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  bool get _hasFilters => _search.isNotEmpty || _status != 'All' || _uploader != null || _from != null || _to != null;

  Future<void> _filtersSheet() async {
    final res = await showPremiumSheet<_Filters>(
      context,
      builder: (_) => _FilterSheet(uploaders: _uploaders, uploader: _uploader, from: _from, to: _to),
    );
    if (res == null || !mounted) return;
    setState(() {
      _uploader = res.uploader;
      _from = res.from;
      _to = res.to;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<AuthProvider>().profile?.role;
    if (!canViewImportHistory(role)) {
      return const DupScreenFrame(
        title: 'Import History',
        subtitle: 'Admins and Team Leaders only',
        body: EmptyState(
          icon: LucideIcons.shieldAlert,
          title: 'Access restricted',
          message: 'Import history is available to Owners, Admins, Branch Managers and Team Leaders.',
        ),
      );
    }
    return DupScreenFrame(
      title: 'Import History',
      subtitle: 'Every lead import with its result and error report.',
      refreshing: _loading && _logs.isNotEmpty,
      onRefresh: _load,
      body: _body(),
    );
  }

  Widget _body() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Row(children: [
          Expanded(
            child: AppSearchField(
              hint: 'Search file, uploader, source',
              controller: _searchCtl,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () {
                  if (!mounted) return;
                  _search = v.trim();
                  _load();
                });
              },
            ),
          ),
          const SizedBox(width: 8),
          Badge(
            isLabelVisible: _uploader != null || _from != null || _to != null,
            child: IconButton.filledTonal(
              tooltip: 'Filters',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: _filtersSheet,
              icon: const Icon(LucideIcons.listFilter, size: 18),
            ),
          ),
        ]),
      ),
      FilterChipRow<String>(
        options: _statuses,
        selected: _status,
        labelOf: (s) => s,
        onSelected: (s) {
          if (s == _status) return;
          setState(() => _status = s);
          _load();
        },
      ),
      const SizedBox(height: 8),
      Expanded(child: _content()),
    ]);
  }

  Widget _content() {
    if (_loading && _logs.isEmpty) return const SkeletonList(count: 4, height: 130);
    if (_error != null && _logs.isEmpty) return ErrorState(message: _error!, onRetry: _load);
    final nf = NumberFormat.decimalPattern();
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.55,
            children: [
              MetricTile(label: 'Imports', value: nf.format(_stats.totalImports), icon: LucideIcons.fileSpreadsheet),
              MetricTile(
                  label: 'Leads imported',
                  value: nf.format(_stats.totalImported),
                  icon: LucideIcons.circleCheck,
                  color: AppColors.statusInterested,
                  caption: 'of ${nf.format(_stats.totalRows)} rows'),
              MetricTile(
                  label: 'Duplicates routed',
                  value: nf.format(_stats.totalDuplicatesRouted),
                  icon: LucideIcons.copyCheck,
                  color: AppColors.amber),
              MetricTile(
                  label: 'Skipped / errors',
                  value: nf.format(_stats.totalErrors),
                  icon: LucideIcons.triangleAlert,
                  color: AppColors.alertRed),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Totals cover the latest 500 imports.', style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
          ),
          SectionHeader(title: 'Imports', subtitle: '${nf.format(_total)} found'),
          if (_logs.isEmpty)
            SizedBox(
              height: 280,
              child: EmptyState(
                icon: LucideIcons.fileSpreadsheet,
                title: _hasFilters ? 'No imports match these filters' : 'No imports yet',
                message: _hasFilters ? null : 'Lead imports are started from the website. Their results appear here.',
                actionLabel: _hasFilters ? 'Clear filters' : null,
                onAction: _hasFilters
                    ? () {
                        _searchCtl.clear();
                        setState(() {
                          _search = '';
                          _status = 'All';
                          _uploader = null;
                          _from = null;
                          _to = null;
                        });
                        _load();
                      }
                    : null,
              ),
            )
          else ...[
            for (final l in _logs) _LogCard(log: l, onTap: () => _showDetail(l)),
            if (_logs.length < _total)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: OutlinedButton(
                  onPressed: _loadingMore ? null : _loadMore,
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: _loadingMore
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text('Load more (${_total - _logs.length} left)'),
                ),
              ),
          ],
          const SizedBox(height: 12),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(LucideIcons.info, size: 14, color: Surf.subtext(context)),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Starting a new import and downloading the original file are available on the website.',
                  style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
            ),
          ]),
        ],
      ),
    );
  }

  void _showDetail(ImportLogModel log) {
    showPremiumSheet<void>(context, builder: (_) => _DetailSheet(log: log));
  }
}

Color _statusColor(String s) {
  switch (s) {
    case 'Completed':
      return AppColors.statusInterested;
    case 'Partially Imported':
      return AppColors.amber;
    case 'Failed':
      return AppColors.alertRed;
    default:
      return AppColors.statusFollowingUp;
  }
}

IconData _statusIcon(String s) {
  switch (s) {
    case 'Completed':
      return LucideIcons.circleCheck;
    case 'Partially Imported':
      return LucideIcons.triangleAlert;
    case 'Failed':
      return LucideIcons.circleX;
    default:
      return LucideIcons.clock;
  }
}

String _stamp(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  return d == null ? '—' : DateFormat('dd MMM yyyy, HH:mm').format(d.toLocal());
}

class _LogCard extends StatelessWidget {
  final ImportLogModel log;
  final VoidCallback onTap;
  const _LogCard({required this.log, required this.onTap});

  @override
  Widget build(BuildContext context) {
    Widget count(String label, int v, Color c) => Expanded(
          child: Column(children: [
            Text('$v', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: c, fontFeatures: tabularFigures)),
            const SizedBox(height: 2),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, color: Surf.subtext(context))),
          ]),
        );
    return PremiumCard(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(LucideIcons.fileSpreadsheet, size: 18, color: Surf.accent(context)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(log.fileName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
          ),
          const SizedBox(width: 8),
          StatusPill(log.status, color: _statusColor(log.status), icon: _statusIcon(log.status)),
        ]),
        const SizedBox(height: 6),
        Text('${log.uploadedByName} · ${importRoleLabel(log.uploadedByRole)}',
            style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
        Text('${_stamp(log.createdAt)} · ${formatFileSize(log.fileSizeBytes)}',
            style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: tabularFigures)),
        const SizedBox(height: 12),
        Row(children: [
          count('Rows', log.totalRows, Surf.text(context)),
          count('Imported', log.importedCount, AppColors.statusInterested),
          count('Duplicates', log.routedDuplicatesCount, AppColors.amber),
          count('Skipped', log.skippedCount, Surf.subtext(context)),
          count('Errors', log.errorCount, AppColors.alertRed),
        ]),
      ]),
    );
  }
}

class _DetailSheet extends StatefulWidget {
  final ImportLogModel log;
  const _DetailSheet({required this.log});

  @override
  State<_DetailSheet> createState() => _DetailSheetState();
}

class _DetailSheetState extends State<_DetailSheet> {
  String _type = 'all';
  static const _types = ['all', 'duplicate_routed', 'invalid', 'skipped', 'error'];
  static const _typeLabel = {
    'all': 'All',
    'duplicate_routed': 'Duplicates',
    'invalid': 'Invalid',
    'skipped': 'Skipped',
    'error': 'Errors',
  };

  String _csv(ImportLogModel l) {
    String q(Object? v) => '"${(v ?? '').toString().replaceAll('"', '""')}"';
    final rows = <String>[
      'Row Number,Lead Name,Phone Number,Category,Details / Reason',
      for (final d in l.errorDetails) [d.rowNumber, q(d.name), q(d.phone), q(d.type), q(d.reason)].join(','),
    ];
    return rows.join('\n');
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.log;
    final details = l.errorDetails.where((d) => _type == 'all' || d.type == _type).toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .85,
      minChildSize: .5,
      maxChildSize: .95,
      builder: (ctx, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: [
          Row(children: [
            Expanded(
              child: Text(l.fileName,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Surf.text(context))),
            ),
            const SizedBox(width: 8),
            StatusPill(l.status, color: _statusColor(l.status), icon: _statusIcon(l.status)),
          ]),
          if (l.summary.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(l.summary, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
            ),
          const SizedBox(height: 10),
          DetailRow('Uploaded by', '${l.uploadedByName} (${importRoleLabel(l.uploadedByRole)})'),
          DetailRow('Started', _stamp(l.createdAt)),
          DetailRow('Completed', _stamp(l.completedAt)),
          DetailRow('File size', formatFileSize(l.fileSizeBytes)),
          DetailRow('Source', l.sourceName),
          DetailRow('Target stage', l.targetStage),
          DetailRow('Assignment', l.assignmentMode),
          const Divider(height: 24),
          DetailRow('Total rows', '${l.totalRows}'),
          DetailRow('Imported', '${l.importedCount}'),
          DetailRow('Duplicates routed', '${l.routedDuplicatesCount}'),
          DetailRow('Updated', '${l.updatedCount}'),
          DetailRow('Skipped', '${l.skippedCount}'),
          DetailRow('Errors', '${l.errorCount}'),
          SectionHeader(
            title: 'Row report',
            subtitle: '${l.errorDetails.length} rows',
            trailing: l.errorDetails.isEmpty
                ? null
                : TextButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: _csv(l)));
                      if (!ctx.mounted) return;
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('Report copied as CSV'), behavior: SnackBarBehavior.floating),
                      );
                    },
                    icon: const Icon(LucideIcons.copy, size: 14),
                    label: const Text('Copy CSV'),
                  ),
          ),
          if (l.errorDetails.isEmpty)
            Text('No error or duplicate row details for this import.', style: TextStyle(fontSize: 13, color: Surf.subtext(context)))
          else ...[
            FilterChipRow<String>(
              options: _types,
              selected: _type,
              labelOf: (t) => _typeLabel[t]!,
              onSelected: (t) => setState(() => _type = t),
            ),
            const SizedBox(height: 10),
            for (final d in details)
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Surf.muted(context),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text('Row ${d.rowNumber}',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: tabularFigures)),
                    const SizedBox(width: 8),
                    StatusPill(_typeLabel[d.type] ?? d.type,
                        color: d.type == 'duplicate_routed' ? AppColors.amber : (d.type == 'skipped' ? Surf.subtext(context) : AppColors.alertRed)),
                  ]),
                  if (d.name.isNotEmpty || d.phone.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('${d.name}${d.name.isNotEmpty && d.phone.isNotEmpty ? ' · ' : ''}${d.phone}',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context))),
                    ),
                  if (d.reason.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(d.reason, style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                    ),
                ]),
              ),
            if (details.isEmpty)
              Text('No rows in this category.', style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
          ],
        ],
      ),
    );
  }
}

class _Filters {
  final String? uploader;
  final DateTime? from;
  final DateTime? to;
  const _Filters(this.uploader, this.from, this.to);
}

class _FilterSheet extends StatefulWidget {
  final List<ImportUploader> uploaders;
  final String? uploader;
  final DateTime? from;
  final DateTime? to;
  const _FilterSheet({required this.uploaders, required this.uploader, required this.from, required this.to});

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  String? _uploader;
  DateTime? _from;
  DateTime? _to;

  @override
  void initState() {
    super.initState();
    _uploader = widget.uploader;
    _from = widget.from;
    _to = widget.to;
  }

  Future<void> _pick(bool from) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: (from ? _from : _to) ?? now,
      firstDate: DateTime(2023),
      lastDate: now.add(const Duration(days: 1)),
    );
    if (d == null) return;
    setState(() => from ? _from = d : _to = d);
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd MMM yyyy');
    Widget dateBtn(String label, DateTime? v, bool from) => Expanded(
          child: OutlinedButton.icon(
            onPressed: () => _pick(from),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            icon: const Icon(LucideIcons.calendar, size: 16),
            label: Text(v == null ? label : fmt.format(v), overflow: TextOverflow.ellipsis),
          ),
        );
    final ids = widget.uploaders.map((u) => u.id).toSet();
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Filters', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 14),
        Text('Uploaded by', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Surf.text(context))),
        const SizedBox(height: 8),
        DropdownButtonFormField<String?>(
          initialValue: ids.contains(_uploader) ? _uploader : null,
          isExpanded: true,
          decoration: InputDecoration(
            filled: true,
            fillColor: Surf.muted(context),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          ),
          items: [
            const DropdownMenuItem<String?>(value: null, child: Text('Everyone')),
            for (final u in widget.uploaders)
              DropdownMenuItem<String?>(value: u.id, child: Text(u.name, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _uploader = v),
        ),
        const SizedBox(height: 16),
        Text('Date range', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Surf.text(context))),
        const SizedBox(height: 8),
        Row(children: [dateBtn('From', _from, true), const SizedBox(width: 8), dateBtn('To', _to, false)]),
        const SizedBox(height: 20),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: () => Navigator.pop(context, const _Filters(null, null, null)),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: const Text('Clear'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: FilledButton(
              onPressed: () => Navigator.pop(context, _Filters(_uploader, _from, _to)),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: const Text('Apply'),
            ),
          ),
        ]),
      ]),
    );
  }
}

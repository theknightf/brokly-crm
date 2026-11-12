import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/duplicates_models.dart';
import '../../data/services/duplicates_service.dart';
import '../../state/auth_provider.dart';
import 'widgets/dup_screen_frame.dart';
import 'widgets/duplicate_card.dart';
import 'widgets/duplicate_merge_sheet.dart';

/// Web `/duplicates`: someone tried to add (or imported) a lead that already exists.
/// The owner of the original lead (and owner / admin / manager) can Merge, Separate or Dismiss.
/// Visibility is decided by RLS on `duplicate_leads`; every action goes through the
/// `resolve_duplicate_lead` RPC which re-checks ownership / role on the server.
class DuplicatesScreen extends StatefulWidget {
  const DuplicatesScreen({super.key});

  @override
  State<DuplicatesScreen> createState() => _DuplicatesScreenState();
}

class _DuplicatesScreenState extends State<DuplicatesScreen> {
  static const _tabs = ['pending', 'merged', 'separated', 'dismissed'];
  static const _labels = {'pending': 'Pending', 'merged': 'Merged', 'separated': 'Separated', 'dismissed': 'Dismissed'};

  final _service = DuplicatesService();
  String _tab = 'pending';
  List<DuplicateItem> _items = [];
  int _pending = 0;
  bool _loading = true;
  String? _error;
  String? _busyId;
  int _reqSeq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    final seq = ++_reqSeq;
    if (!silent) setState(() => _loading = true);
    try {
      final results = await Future.wait([_service.fetchItems(_tab), _service.pendingCount()]);
      if (!mounted || seq != _reqSeq) return;
      setState(() {
        _items = results[0] as List<DuplicateItem>;
        _pending = results[1] as int;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _reqSeq) return;
      setState(() {
        _error = duplicatesErrorMessage(e, fallback: 'Failed to load duplicates');
        _loading = false;
      });
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
  }

  Future<void> _act(DuplicateItem item, String action, String okMsg,
      {Map<String, String> choices = const {}, bool appendNotes = true}) async {
    if (_busyId != null) return; // double-submit guard
    setState(() => _busyId = item.id);
    try {
      await _service.resolve(item.id, action, choices: choices, appendNotes: appendNotes);
      if (!mounted) return;
      _toast(okMsg);
      await _load(silent: true);
    } catch (e) {
      if (mounted) _toast(duplicatesErrorMessage(e, fallback: 'Action failed'));
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _dismiss(DuplicateItem item) async {
    final ok = await confirmAction(context,
        title: 'Dismiss this duplicate?',
        message: 'The attempt is closed and nothing is added to the existing lead.',
        confirmLabel: 'Dismiss');
    if (ok && mounted) await _act(item, 'dismiss', 'Duplicate dismissed');
  }

  Future<void> _separate(DuplicateItem item) async {
    final ok = await confirmAction(context,
        title: 'Keep both as separate leads?',
        message: 'The new submission becomes an independent lead owned by the person who added it.',
        confirmLabel: 'Separate');
    if (ok && mounted) await _act(item, 'separate', 'Kept as a separate lead');
  }

  Future<void> _merge(DuplicateItem item) async {
    if (_busyId != null) return;
    final choice = await showDuplicateMergeSheet(context, item);
    if (choice == null || !mounted) return;
    final ok = await confirmAction(context,
        title: 'Merge into the existing lead?',
        message: 'This writes the selected values to the existing lead and cannot be undone from the app.',
        confirmLabel: 'Merge');
    if (ok && mounted) {
      await _act(item, 'merge', 'Merged into the existing lead', choices: choice.choices, appendNotes: choice.appendNotes);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<AuthProvider>().profile?.role;
    final reviewer = isDuplicateReviewerRole(role);
    return DupScreenFrame(
      title: 'Duplicates',
      subtitle: reviewer
          ? 'Merge new details into an existing lead, or dismiss the attempt.'
          : 'Duplicates of your own leads, waiting for your review.',
      refreshing: _loading && _items.isNotEmpty,
      onRefresh: _load,
      body: Column(children: [
        const SizedBox(height: 8),
        FilterChipRow<String>(
          options: _tabs,
          selected: _tab,
          labelOf: (t) => _labels[t]! + (t == 'pending' && _pending > 0 ? ' ($_pending)' : ''),
          onSelected: (t) {
            if (t == _tab) return;
            setState(() {
              _tab = t;
              _items = [];
            });
            _load();
          },
        ),
        const SizedBox(height: 8),
        Expanded(child: _content()),
      ]),
    );
  }

  Widget _content() {
    if (_loading && _items.isEmpty) return const SkeletonList(count: 3, height: 220);
    if (_error != null && _items.isEmpty) return ErrorState(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: _items.isEmpty
          ? ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
              SizedBox(
                height: 360,
                child: EmptyState(
                  icon: LucideIcons.circleCheck,
                  title: _tab == 'pending' ? 'No duplicates to review' : 'No $_tab duplicates',
                  message: 'When someone adds or imports a lead that already exists, it shows up here for the lead\'s owner.',
                ),
              ),
            ])
          : ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              itemCount: _items.length,
              itemBuilder: (_, i) {
                final item = _items[i];
                return DuplicateCard(
                  item: item,
                  busy: _busyId == item.id,
                  onMerge: () => _merge(item),
                  onSeparate: () => _separate(item),
                  onDismiss: () => _dismiss(item),
                );
              },
            ),
    );
  }
}

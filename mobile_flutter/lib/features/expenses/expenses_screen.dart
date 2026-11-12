import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/expenses_model.dart';
import '../../data/services/expenses_service.dart';
import '../../state/auth_provider.dart';

const List<String> kDefaultExpenseCategories = [
  'Electricity',
  'Water',
  'Rent',
  'Internet',
  'Phone',
  'Kitchen Staff',
  'Cleaning Staff',
  'Salaries',
  'Office Supplies',
  'Transport',
  'Fuel',
  'Marketing',
  'Maintenance',
  'Meals',
  'Miscellaneous',
];

const _tabular = [FontFeature.tabularFigures()];

String _fmtDate(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso.isEmpty ? '—' : iso;
  return DateFormat('dd MMM yyyy').format(d);
}

/// Office and branch running costs. Owners/admins only (same as the web page and RLS).
/// Embeddable in the shell (no app bar) or pushed standalone with [showAppBar].
class ExpensesScreen extends StatefulWidget {
  final bool showAppBar;
  const ExpensesScreen({super.key, this.showAppBar = false});

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  final ExpensesService _service = ExpensesService();
  final TextEditingController _searchCtrl = TextEditingController();

  List<ExpenseModel> _items = [];
  bool _loading = true;
  bool _notInitialized = false;
  String? _error;
  String _search = '';
  String _category = 'All';
  late DateTime _from;
  late DateTime _to;
  int _loadSeq = 0;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = DateTime(now.year, now.month, 1);
    _to = DateTime(now.year, now.month, now.day);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool get _isAdmin => context.read<AuthProvider>().profile?.isAdmin ?? false;

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;
    if (!_isAdmin) {
      setState(() => _loading = false);
      return;
    }
    final seq = ++_loadSeq;
    if (!silent) setState(() => _loading = true);
    try {
      final data = await _service.getAll(
        from: ExpensesService.isoDate(_from),
        to: ExpensesService.isoDate(_to),
        category: _category,
      );
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _items = data;
        _error = null;
        _notInitialized = false;
        _loading = false;
      });
    } on ExpensesNotInitialized {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _notInitialized = true;
        _items = [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<String> get _categories {
    final used = _items.map((e) => e.category).where((c) => c.isNotEmpty).toSet();
    return {...kDefaultExpenseCategories, ...used}.toList()..sort();
  }

  List<ExpenseModel> get _filtered {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return _items;
    return _items
        .where((e) =>
            e.title.toLowerCase().contains(q) ||
            e.category.toLowerCase().contains(q) ||
            e.notes.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _pickRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDateRange: DateTimeRange(start: _from, end: _to),
    );
    if (picked == null) return;
    setState(() {
      _from = picked.start;
      _to = picked.end;
    });
    _load();
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? AppColors.alertRed : null));
  }

  Future<void> _openForm([ExpenseModel? existing]) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (_) => _ExpenseForm(existing: existing, categories: _categories, service: _service),
    );
    if (saved == true) {
      _toast(existing == null ? 'Expense added' : 'Expense updated');
      _load(silent: true);
    }
  }

  Future<void> _delete(ExpenseModel e) async {
    final ok = await confirmAction(
      context,
      title: 'Delete Expense',
      message: 'Delete "${e.title.isEmpty ? e.category : e.title}"? This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.delete(e.id);
      _toast('Expense deleted');
      _load(silent: true);
    } catch (err) {
      _toast('Failed to delete expense: $err', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AuthProvider>().profile?.isAdmin ?? false;
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: widget.showAppBar ? AppBar(title: const Text('Expenses')) : null,
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(
              onPressed: () => _openForm(),
              icon: const Icon(LucideIcons.plus),
              label: const Text('Add Expense'),
            )
          : null,
      body: isAdmin ? _body(context) : _denied(),
    );
  }

  Widget _denied() => const EmptyState(
        icon: LucideIcons.shieldCheck,
        title: 'Access Denied',
        message: 'Only admins and owners can view expenses. Contact your administrator if you need access.',
      );

  Widget _body(BuildContext context) {
    if (_loading) return const SkeletonList(count: 6, height: 84);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    if (_notInitialized) {
      return const EmptyState(
        icon: LucideIcons.layers,
        title: 'Expenses not initialized',
        message: 'The expenses table has not been created in Supabase yet. Run the expenses migration, then retry.',
      );
    }

    final items = _filtered;
    final total = items.fold<double>(0, (s, e) => s + e.amount);
    final byCat = <String, double>{};
    for (final e in items) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    }
    final cats = byCat.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final top = cats.isEmpty ? null : cats.first;
    final maxCat = (cats.isEmpty || cats.first.value <= 0) ? 1.0 : cats.first.value;
    final fromTxt = DateFormat('dd MMM').format(_from);
    final toTxt = DateFormat('dd MMM yyyy').format(_to);

    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
        children: [
          Row(children: [
            Expanded(
                child: MetricTile(
                    label: 'Total (filtered)', value: CurrencyFormatter.formatCompact(total), icon: LucideIcons.wallet)),
            const SizedBox(width: 12),
            Expanded(
                child: MetricTile(
                    label: 'Entries', value: '${items.length}', icon: LucideIcons.layers, color: AppColors.amber)),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
                child: MetricTile(
              label: 'Top category',
              value: top?.key ?? '—',
              icon: LucideIcons.trendingUp,
              color: AppColors.statusInterested,
              caption: top == null ? null : CurrencyFormatter.formatCompact(top.value),
            )),
            const SizedBox(width: 12),
            Expanded(
              child: GestureDetector(
                onTap: _pickRange,
                child: MetricTile(
                    label: 'Period',
                    value: fromTxt,
                    icon: LucideIcons.calendarDays,
                    color: AppColors.tealCyan,
                    caption: 'to $toTxt'),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          AppSearchField(
              hint: 'Search title, category, notes',
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _search = v)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: SizedBox(
                height: 48,
                child: OutlinedButton.icon(
                  onPressed: _pickRange,
                  icon: const Icon(LucideIcons.calendarRange, size: 16),
                  label: Text('$fromTxt – $toTxt', maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _categories.contains(_category) ? _category : 'All',
                isExpanded: true,
                decoration: InputDecoration(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
                items: [
                  const DropdownMenuItem(value: 'All', child: Text('All categories', overflow: TextOverflow.ellipsis)),
                  ..._categories.map((c) => DropdownMenuItem(value: c, child: Text(c, overflow: TextOverflow.ellipsis))),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _category = v);
                  _load();
                },
              ),
            ),
          ]),
          if (cats.isNotEmpty) ...[
            const SizedBox(height: 16),
            const SectionHeader(title: 'Breakdown by category'),
            PremiumCard(
              child: Column(
                children: [
                  for (final c in cats)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(children: [
                        SizedBox(
                            width: 96,
                            child: Text(c.key,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Surf.text(context)))),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              value: (c.value / maxCat).clamp(0.0, 1.0),
                              minHeight: 8,
                              color: Surf.accent(context),
                              backgroundColor: Surf.muted(context),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        SizedBox(
                            width: 78,
                            child: Text(CurrencyFormatter.formatCompact(c.value),
                                textAlign: TextAlign.end,
                                style: TextStyle(fontSize: 12, color: Surf.subtext(context), fontFeatures: _tabular))),
                      ]),
                    ),
                ],
              ),
            ),
          ],
          SectionHeader(title: 'Expense log', subtitle: '${items.length} entries'),
          if (items.isEmpty)
            SizedBox(
              height: 260,
              child: EmptyState(
                icon: LucideIcons.receipt,
                title: _search.isNotEmpty ? 'No matching expenses' : 'No expenses yet',
                message: _search.isNotEmpty
                    ? 'Try a different search or date range.'
                    : 'Add electricity, rent, kitchen staff and other costs to track them here.',
                actionLabel: _search.isNotEmpty ? null : 'Add Expense',
                onAction: _search.isNotEmpty ? null : () => _openForm(),
              ),
            )
          else
            for (final e in items) _ExpenseTile(expense: e, onEdit: () => _openForm(e), onDelete: () => _delete(e)),
        ],
      ),
    );
  }
}

class _ExpenseTile extends StatelessWidget {
  final ExpenseModel expense;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _ExpenseTile({required this.expense, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final e = expense;
    return PremiumCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 4, 4),
      onTap: onEdit,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Text(e.title.isEmpty ? 'Untitled' : e.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: Surf.text(context))),
            ),
            const SizedBox(width: 8),
            Text(CurrencyFormatter.format(e.amount),
                style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w800, color: Surf.text(context), fontFeatures: _tabular)),
          ]),
        ),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          StatusPill(e.category, color: Surf.accent(context)),
          Text(_fmtDate(e.expenseDate), style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
        ]),
        if (e.notes.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 12),
            child: Text(e.notes,
                maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Surf.subtext(context))),
          ),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          IconButton(
              tooltip: 'Edit',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: onEdit,
              icon: Icon(LucideIcons.pencil, size: 17, color: Surf.subtext(context))),
          IconButton(
              tooltip: 'Delete',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              onPressed: onDelete,
              icon: const Icon(LucideIcons.trash2, size: 17, color: AppColors.alertRed)),
        ]),
      ]),
    );
  }
}

class _ExpenseForm extends StatefulWidget {
  final ExpenseModel? existing;
  final List<String> categories;
  final ExpensesService service;
  const _ExpenseForm({required this.existing, required this.categories, required this.service});

  @override
  State<_ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends State<_ExpenseForm> {
  late final TextEditingController _title;
  late final TextEditingController _amount;
  late final TextEditingController _notes;
  late String _category;
  late DateTime _date;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _title = TextEditingController(text: e?.title ?? '');
    _amount = TextEditingController(text: e == null || e.amount == 0 ? '' : e.amount.toString());
    _notes = TextEditingController(text: e?.notes ?? '');
    _category = e?.category ?? 'Electricity';
    if (!widget.categories.contains(_category)) _category = widget.categories.first;
    _date = e?.date ?? DateTime.now();
  }

  @override
  void dispose() {
    _title.dispose();
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amountText = _amount.text.trim().replaceAll(',', '');
    final amount = double.tryParse(amountText);
    if (_title.text.trim().isEmpty && (amount == null || amount <= 0)) {
      setState(() => _error = 'Enter a title or a valid amount');
      return;
    }
    if (amountText.isNotEmpty && (amount == null || amount < 0)) {
      setState(() => _error = 'Amount must be a positive number');
      return;
    }
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      final iso = ExpensesService.isoDate(_date);
      if (widget.existing == null) {
        await widget.service.create(
            title: _title.text, category: _category, amount: amount ?? 0, expenseDate: iso, notes: _notes.text.trim());
      } else {
        await widget.service.update(widget.existing!.id,
            title: _title.text, category: _category, amount: amount ?? 0, expenseDate: iso, notes: _notes.text.trim());
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Failed to save expense: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.existing != null;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Text(isEdit ? 'Edit Expense' : 'Add Expense',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 16),
        TextField(
          controller: _title,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Title', hintText: 'e.g. Monthly electricity bill'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _category,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Category'),
          items: widget.categories
              .map((c) => DropdownMenuItem(value: c, child: Text(c, overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) => setState(() => _category = v ?? _category),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          decoration: const InputDecoration(labelText: 'Amount (EGP)', hintText: '0.00'),
        ),
        const SizedBox(height: 12),
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final d = await showDatePicker(
                context: context,
                initialDate: _date,
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)));
            if (d != null) setState(() => _date = d);
          },
          child: InputDecorator(
            decoration: const InputDecoration(labelText: 'Date', suffixIcon: Icon(LucideIcons.calendar, size: 18)),
            child: Text(DateFormat('dd MMM yyyy').format(_date)),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _notes,
          maxLines: 2,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Notes', hintText: 'Optional details…'),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: AppColors.alertRed)),
          ),
        const SizedBox(height: 18),
        Row(children: [
          Expanded(
              child: SizedBox(
                  height: 48,
                  child: OutlinedButton(onPressed: _saving ? null : () => Navigator.pop(context), child: const Text('Cancel')))),
          const SizedBox(width: 12),
          Expanded(
            child: SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(isEdit ? 'Save Changes' : 'Add Expense'),
              ),
            ),
          ),
        ]),
      ]),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/currency_formatter.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/deals_service.dart';
import '../../state/auth_provider.dart';
import '../leads/widgets/status_change_sheet.dart';

const _tabular = [FontFeature.tabularFigures()];

enum _Sort { newest, value, name }

enum _Action { call, edit, stage, delete }

double _dealValue(LeadModel l) {
  if (l.finalPrice > 0) return l.finalPrice;
  if (l.totalPrice > 0) return l.totalPrice;
  return l.unitPrice;
}

String _fmtDay(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final d = DateTime.tryParse(raw);
  return d == null ? raw : DateFormat('dd MMM yyyy').format(d);
}

String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Shared list for the Deals ("Done Deal") and Reservations pages: both are the
/// leads list pre-filtered on `crm_status`, with the same role scoping as Leads.
class DealsListView extends StatefulWidget {
  /// 'Done Deal' or 'Reservation'.
  final String status;
  final String subtitle;
  final bool showAppBar;
  final String appBarTitle;

  const DealsListView({
    super.key,
    required this.status,
    required this.subtitle,
    required this.appBarTitle,
    this.showAppBar = false,
  });

  @override
  State<DealsListView> createState() => _DealsListViewState();
}

class _DealsListViewState extends State<DealsListView> {
  final DealsService _service = DealsService();
  final TextEditingController _searchCtrl = TextEditingController();

  List<LeadModel> _items = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  _Sort _sort = _Sort.newest;
  int _seq = 0;

  bool get _isReservation => widget.status == DealsService.reservation;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted) return;
    final seq = ++_seq;
    if (!silent) setState(() => _loading = true);
    try {
      final data = await _service.fetch(widget.status);
      if (!mounted || seq != _seq) return;
      setState(() {
        _items = data;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  String? _dealDate(LeadModel l) => _isReservation ? (l.reservationDate ?? l.createdAt) : (l.closingDate ?? l.createdAt);

  List<LeadModel> get _visible {
    final q = _search.trim().toLowerCase();
    var list = q.isEmpty
        ? List<LeadModel>.from(_items)
        : _items.where((l) {
            return l.name.toLowerCase().contains(q) ||
                l.phone.toLowerCase().contains(q) ||
                (l.email ?? '').toLowerCase().contains(q) ||
                (l.project ?? '').toLowerCase().contains(q) ||
                (l.unit ?? '').toLowerCase().contains(q) ||
                (l.assignedToName ?? l.agent ?? '').toLowerCase().contains(q);
          }).toList();
    switch (_sort) {
      case _Sort.newest:
        list.sort((a, b) => (_dealDate(b) ?? '').compareTo(_dealDate(a) ?? ''));
      case _Sort.value:
        list.sort((a, b) => _dealValue(b).compareTo(_dealValue(a)));
      case _Sort.name:
        list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    }
    return list;
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? AppColors.alertRed : null));
  }

  Future<void> _openDetail(LeadModel lead) async {
    final isAdmin = context.read<AuthProvider>().profile?.isAdmin ?? false;
    final action = await showPremiumSheet<_Action>(
      context,
      builder: (_) => _DealDetailSheet(lead: lead, isReservation: _isReservation, canDelete: isAdmin),
    );
    if (action == null || !mounted) return;
    switch (action) {
      case _Action.call:
        final uri = Uri(scheme: 'tel', path: lead.phone);
        if (!await launchUrl(uri)) _toast('Could not open the dialer', error: true);
      case _Action.edit:
        await _openDealForm(lead, widget.status);
      case _Action.stage:
        await _changeStage(lead);
      case _Action.delete:
        await _delete(lead);
    }
  }

  Future<void> _openDealForm(LeadModel lead, String status) async {
    final saved = await showPremiumSheet<bool>(
      context,
      builder: (_) => _DealForm(lead: lead, status: status, service: _service),
    );
    if (saved == true) {
      _toast(status == DealsService.reservation ? 'Lead marked as Reservation' : 'Lead marked as Done Deal');
      _load(silent: true);
    }
  }

  Future<void> _changeStage(LeadModel lead) async {
    String? picked;
    await StatusChangeSheet.show(context, currentStatus: lead.status, onSelectStatus: (s) => picked = s);
    final target = picked;
    if (target == null || !mounted || target == lead.status) return;
    if (target == DealsService.reservation || target == DealsService.doneDeal) {
      await _openDealForm(lead, target);
      return;
    }
    try {
      await _service.changeStage(lead.id, target);
      if (!mounted) return;
      setState(() => _items = _items.where((l) => l.id != lead.id).toList());
      _toast('Moved to $target');
    } catch (e) {
      _toast('Failed to update stage: $e', error: true);
    }
  }

  Future<void> _delete(LeadModel lead) async {
    final ok = await confirmAction(
      context,
      title: 'Delete lead',
      message: 'Delete "${lead.name}"? This permanently removes the lead and cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    try {
      await _service.delete(lead.id);
      if (!mounted) return;
      setState(() => _items = _items.where((l) => l.id != lead.id).toList());
      _toast('Lead deleted');
    } catch (e) {
      _toast('Failed to delete lead: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: widget.showAppBar ? AppBar(title: Text(widget.appBarTitle)) : null,
      body: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    if (_loading) return const SkeletonList(count: 6, height: 120);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final items = _visible;
    final totalValue = _items.fold<double>(0, (s, l) => s + _dealValue(l));
    final totalCommission = _items.fold<double>(0, (s, l) => s + l.commission);
    final totalReserved = _items.fold<double>(0, (s, l) => s + l.reservationAmount);

    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(children: [
            Expanded(
                child: MetricTile(
              label: _isReservation ? 'Reservations' : 'Deals',
              value: '${_items.length}',
              icon: _isReservation ? LucideIcons.badgeCheck : LucideIcons.handshake,
              caption: widget.subtitle,
            )),
            const SizedBox(width: 12),
            Expanded(
                child: MetricTile(
              label: 'Total value',
              value: CurrencyFormatter.formatCompact(totalValue),
              icon: LucideIcons.wallet,
              color: AppColors.tealCyan,
            )),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
                child: MetricTile(
              label: _isReservation ? 'Reserved amount' : 'Commission',
              value: CurrencyFormatter.formatCompact(_isReservation ? totalReserved : totalCommission),
              icon: _isReservation ? LucideIcons.piggyBank : LucideIcons.coins,
              color: AppColors.amber,
            )),
            const SizedBox(width: 12),
            Expanded(
                child: MetricTile(
              label: _isReservation ? 'Commission' : 'Avg. deal',
              value: CurrencyFormatter.formatCompact(
                  _isReservation ? totalCommission : (_items.isEmpty ? 0 : totalValue / _items.length)),
              icon: LucideIcons.trendingUp,
              color: AppColors.statusInterested,
            )),
          ]),
          const SizedBox(height: 16),
          AppSearchField(
              hint: 'Search name, phone, project, unit, agent',
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _search = v)),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final s in _Sort.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(switch (s) {
                        _Sort.newest => 'Newest',
                        _Sort.value => 'Highest value',
                        _Sort.name => 'Name A-Z',
                      }),
                      selected: _sort == s,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _sort = s),
                      selectedColor: Surf.accent(context),
                      backgroundColor: Surf.muted(context),
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                      labelStyle: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: _sort == s ? Colors.black : Surf.subtext(context)),
                    ),
                  ),
              ],
            ),
          ),
          SectionHeader(title: _isReservation ? 'Reservations' : 'Closed deals', subtitle: '${items.length} shown'),
          if (items.isEmpty)
            SizedBox(
              height: 280,
              child: EmptyState(
                icon: _isReservation ? LucideIcons.badgeCheck : LucideIcons.handshake,
                title: _search.isNotEmpty
                    ? 'No matches'
                    : (_isReservation ? 'No reservations yet' : 'No deals yet'),
                message: _search.isNotEmpty
                    ? 'Try a different search.'
                    : (_isReservation
                        ? 'Leads moved to the Reservation stage will appear here.'
                        : 'Leads moved to the Done Deal stage will appear here.'),
              ),
            )
          else
            for (final l in items)
              _DealCard(lead: l, isReservation: _isReservation, date: _dealDate(l), onTap: () => _openDetail(l)),
        ],
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  final LeadModel lead;
  final bool isReservation;
  final String? date;
  final VoidCallback onTap;
  const _DealCard({required this.lead, required this.isReservation, required this.date, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final l = lead;
    final value = isReservation && l.reservationAmount > 0 ? l.reservationAmount : _dealValue(l);
    final place = [if ((l.project ?? '').isNotEmpty) l.project!, if ((l.unit ?? '').isNotEmpty) l.unit!].join(' · ');
    final agent = l.assignedToName ?? l.agent;
    return PremiumCard(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.name.isEmpty ? 'Unnamed lead' : l.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Surf.text(context))),
              if (place.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(place,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: Surf.subtext(context))),
                ),
            ]),
          ),
          const SizedBox(width: 8),
          StatusPill(l.status),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(isReservation && l.reservationAmount > 0 ? 'Reserved' : 'Deal value',
                  style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
              Text(value > 0 ? CurrencyFormatter.format(value) : '—',
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800, color: Surf.accent(context), fontFeatures: _tabular)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(isReservation ? 'Reservation date' : 'Closing date',
                style: TextStyle(fontSize: 11, color: Surf.subtext(context))),
            Text(_fmtDay(date),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Surf.text(context))),
          ]),
        ]),
        if ((agent ?? '').isNotEmpty || l.commission > 0) ...[
          const SizedBox(height: 10),
          Row(children: [
            if ((agent ?? '').isNotEmpty) ...[
              Icon(LucideIcons.user, size: 13, color: Surf.subtext(context)),
              const SizedBox(width: 4),
              Flexible(
                  child: Text(agent!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: Surf.subtext(context)))),
            ],
            const Spacer(),
            if (l.commission > 0)
              Text('Commission ${CurrencyFormatter.formatCompact(l.commission)}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Surf.subtext(context), fontFeatures: _tabular)),
          ]),
        ],
      ]),
    );
  }
}

class _DealDetailSheet extends StatelessWidget {
  final LeadModel lead;
  final bool isReservation;
  final bool canDelete;
  const _DealDetailSheet({required this.lead, required this.isReservation, required this.canDelete});

  String _money(double v) => v > 0 ? CurrencyFormatter.format(v) : '—';

  @override
  Widget build(BuildContext context) {
    final l = lead;
    final dp = l.downPayment > 0
        ? '${CurrencyFormatter.format(l.downPayment)}${l.downPaymentPct > 0 ? ' (${l.downPaymentPct.toStringAsFixed(l.downPaymentPct % 1 == 0 ? 0 : 1)}%)' : ''}'
        : '—';
    final inst = l.installmentAmount > 0
        ? '${CurrencyFormatter.format(l.installmentAmount)}${l.installmentCount > 0 ? ' × ${l.installmentCount}' : ''}'
        : '—';
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Expanded(
              child: Text(l.name.isEmpty ? 'Unnamed lead' : l.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: Surf.text(context)))),
          const SizedBox(width: 8),
          StatusPill(l.status),
        ]),
        const SizedBox(height: 10),
        DetailRow('Phone', l.phone),
        DetailRow('Email', l.email ?? ''),
        DetailRow('Project', l.project ?? ''),
        DetailRow('Unit', l.unit ?? ''),
        DetailRow('Agent', l.assignedToName ?? l.agent ?? ''),
        const Divider(height: 24),
        DetailRow('Total price', _money(l.totalPrice)),
        DetailRow('Final price', _money(l.finalPrice)),
        DetailRow('Down payment', dp),
        DetailRow('Reservation', _money(l.reservationAmount)),
        DetailRow('Remaining', _money(l.remainingAmount)),
        DetailRow('Installment', inst),
        DetailRow('Payment status', l.paymentStatus),
        DetailRow('Reservation date', _fmtDay(l.reservationDate).replaceAll('—', '')),
        DetailRow('Closing date', _fmtDay(l.closingDate).replaceAll('—', '')),
        DetailRow('Commission', _money(l.commission)),
        if ((l.notes ?? '').trim().isNotEmpty) ...[
          const Divider(height: 24),
          Text(l.notes!, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
        ],
        const SizedBox(height: 16),
        Row(children: [
          if (l.phone.isNotEmpty) ...[
            Expanded(
                child: SizedBox(
                    height: 48,
                    child: OutlinedButton.icon(
                        onPressed: () => Navigator.pop(context, _Action.call),
                        icon: const Icon(LucideIcons.phone, size: 16),
                        label: const Text('Call')))),
            const SizedBox(width: 10),
          ],
          Expanded(
              child: SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                      onPressed: () => Navigator.pop(context, _Action.edit),
                      icon: const Icon(LucideIcons.pencil, size: 16),
                      label: const Text('Edit deal')))),
        ]),
        const SizedBox(height: 10),
        SizedBox(
            height: 48,
            child: OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, _Action.stage),
                icon: const Icon(LucideIcons.arrowRightLeft, size: 16),
                label: const Text('Change stage'))),
        if (canDelete) ...[
          const SizedBox(height: 10),
          SizedBox(
              height: 48,
              child: TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: AppColors.alertRed),
                  onPressed: () => Navigator.pop(context, _Action.delete),
                  icon: const Icon(LucideIcons.trash2, size: 16),
                  label: const Text('Delete lead'))),
        ],
      ]),
    );
  }
}

/// Mirrors the web DealStatusModal: date, reservation amount, final price, commission.
class _DealForm extends StatefulWidget {
  final LeadModel lead;
  final String status;
  final DealsService service;
  const _DealForm({required this.lead, required this.status, required this.service});

  @override
  State<_DealForm> createState() => _DealFormState();
}

class _DealFormState extends State<_DealForm> {
  late DateTime _date;
  late final TextEditingController _amount;
  late final TextEditingController _final;
  late final TextEditingController _commission;
  bool _saving = false;
  String? _error;

  bool get _isReservation => widget.status == DealsService.reservation;

  static String _num(double v) => v <= 0 ? '' : (v % 1 == 0 ? v.toStringAsFixed(0) : v.toString());

  @override
  void initState() {
    super.initState();
    final l = widget.lead;
    final raw = _isReservation ? l.reservationDate : l.closingDate;
    _date = DateTime.tryParse(raw ?? '') ?? DateTime.now();
    _amount = TextEditingController(text: _num(l.reservationAmount));
    final fp = l.finalPrice > 0 ? l.finalPrice : (l.totalPrice > 0 ? l.totalPrice : l.unitPrice);
    _final = TextEditingController(text: _num(fp));
    _commission = TextEditingController(text: _num(l.commission));
  }

  @override
  void dispose() {
    _amount.dispose();
    _final.dispose();
    _commission.dispose();
    super.dispose();
  }

  double _parse(TextEditingController c) => double.tryParse(c.text.trim().replaceAll(',', '')) ?? 0;

  Future<void> _save() async {
    final a = _parse(_amount), f = _parse(_final), c = _parse(_commission);
    if (a < 0 || f < 0 || c < 0) {
      setState(() => _error = 'Amounts cannot be negative');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.service.saveDeal(
          lead: widget.lead, status: widget.status, date: _iso(_date), amount: a, finalPrice: f, commission: c);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Failed to save: $e';
        });
      }
    }
  }

  Widget _moneyField(TextEditingController c, String label) => TextField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
        decoration: InputDecoration(labelText: label),
      );

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Text(_isReservation ? 'Confirm Reservation' : 'Confirm Done Deal',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Surf.text(context))),
        const SizedBox(height: 4),
        Text(widget.lead.name, style: TextStyle(fontSize: 13, color: Surf.subtext(context))),
        const SizedBox(height: 16),
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final d = await showDatePicker(
                context: context,
                initialDate: _date,
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365 * 3)));
            if (d != null) setState(() => _date = d);
          },
          child: InputDecorator(
            decoration: InputDecoration(
                labelText: _isReservation ? 'Reservation date' : 'Closing date',
                suffixIcon: const Icon(LucideIcons.calendar, size: 18)),
            child: Text(DateFormat('dd MMM yyyy').format(_date)),
          ),
        ),
        if (_isReservation) ...[const SizedBox(height: 12), _moneyField(_amount, 'Reservation amount (EGP)')],
        const SizedBox(height: 12),
        _moneyField(_final, 'Final price (EGP)'),
        const SizedBox(height: 12),
        _moneyField(_commission, 'Commission (EGP)'),
        if (_error != null)
          Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: AppColors.alertRed))),
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
                    : Text(_isReservation ? 'Confirm Reservation' : 'Confirm Done Deal', maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ),
          ),
        ]),
      ]),
    );
  }
}

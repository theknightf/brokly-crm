import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/units_service.dart';
import '../../state/leads_provider.dart';
import '../leads/widgets/log_call_dialog.dart';

class _ScoredUnitRecommendation {
  final UnitModel unit;
  final int score;
  final List<String> reasons;

  const _ScoredUnitRecommendation({
    required this.unit,
    required this.score,
    required this.reasons,
  });
}

class UnitCalculatorScreen extends StatefulWidget {
  final bool showAppBar;

  const UnitCalculatorScreen({
    super.key,
    this.showAppBar = true,
  });

  @override
  State<UnitCalculatorScreen> createState() => _UnitCalculatorScreenState();
}

class _UnitCalculatorScreenState extends State<UnitCalculatorScreen> {
  final UnitsService _unitsService = UnitsService();
  final NumberFormat _fmt = NumberFormat('#,##0', 'en_US');

  // Input Controllers
  final TextEditingController _meterPriceCtrl = TextEditingController();
  final TextEditingController _totalMetersCtrl = TextEditingController();
  final TextEditingController _maintPctCtrl = TextEditingController(text: '8');
  final TextEditingController _maintFixedCtrl = TextEditingController();
  final TextEditingController _downPctCtrl = TextEditingController(text: '10');
  final TextEditingController _downFixedCtrl = TextEditingController();
  final TextEditingController _handoverPctCtrl = TextEditingController(text: '0');
  final TextEditingController _handoverFixedCtrl = TextEditingController();
  final TextEditingController _discountPctCtrl = TextEditingController(text: '0');
  final TextEditingController _discountFixedCtrl = TextEditingController();
  final TextEditingController _garageFeeCtrl = TextEditingController(text: '0');
  final TextEditingController _installmentYearsCtrl = TextEditingController(text: '8');

  // Modes ('pct' or 'fixed')
  String _maintenanceMode = 'pct';
  String _downPaymentMode = 'pct';
  String _handoverMode = 'pct';
  String _discountMode = 'pct';

  // Frequency (12 = Monthly, 4 = Quarterly, 2 = Semi-annual, 1 = Annual)
  int _installmentFrequency = 12;

  // Selected Lead (optional customer context)
  LeadModel? _selectedLead;

  // Live Inventory for Recommendations
  List<UnitModel> _units = [];
  Map<String, ProjectModel> _projects = {};
  final Map<String, String> _unitImages = {};
  bool _loadingUnits = true;

  static const Map<int, String> _frequencyLabels = {
    12: 'Monthly',
    4: 'Quarterly',
    2: 'Semi-annual',
    1: 'Annual',
  };

  @override
  void initState() {
    super.initState();
    _loadInventory();
  }

  @override
  void dispose() {
    _meterPriceCtrl.dispose();
    _totalMetersCtrl.dispose();
    _maintPctCtrl.dispose();
    _maintFixedCtrl.dispose();
    _downPctCtrl.dispose();
    _downFixedCtrl.dispose();
    _handoverPctCtrl.dispose();
    _handoverFixedCtrl.dispose();
    _discountPctCtrl.dispose();
    _discountFixedCtrl.dispose();
    _garageFeeCtrl.dispose();
    _installmentYearsCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInventory() async {
    setState(() => _loadingUnits = true);
    try {
      final results = await Future.wait([
        _unitsService.getAllUnits(),
        _unitsService.getAllProjects(),
      ]);
      final fetchedUnits = results[0] as List<UnitModel>;
      final fetchedProjects = results[1] as List<ProjectModel>;
      final projMap = <String, ProjectModel>{
        for (final p in fetchedProjects) p.id: p,
      };

      if (mounted) {
        setState(() {
          _units = fetchedUnits;
          _projects = projMap;
          _loadingUnits = false;
        });
      }

      // Lazily resolve images for available units
      for (final u in fetchedUnits.take(15)) {
        final url = await _unitsService.resolveUnitImageUrl(u, projMap[u.projectId]);
        if (url.isNotEmpty && mounted) {
          setState(() {
            _unitImages[u.id] = url;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingUnits = false);
      }
    }
  }

  void _onSelectLead(LeadModel? lead) {
    setState(() {
      _selectedLead = lead;
      if (lead == null) return;

      // Auto-populate calculator fields from lead's linked unit or budget
      UnitModel? linkedUnit;
      if (lead.unitId != null && lead.unitId!.isNotEmpty) {
        linkedUnit = _units.where((u) => u.id == lead.unitId).firstOrNull;
      }
      if (linkedUnit == null && lead.project != null && lead.project!.isNotEmpty) {
        final pLower = lead.project!.toLowerCase().trim();
        linkedUnit = _units
            .where((u) =>
                u.status == 'Available' &&
                u.projectName.toLowerCase().trim() == pLower)
            .firstOrNull;
      }

      if (linkedUnit != null && linkedUnit.area > 0 && linkedUnit.price > 0) {
        _totalMetersCtrl.text = linkedUnit.area.toStringAsFixed(0);
        _meterPriceCtrl.text = (linkedUnit.price / linkedUnit.area).round().toString();
        if (linkedUnit.downPaymentPct > 0) {
          _downPaymentMode = 'pct';
          _downPctCtrl.text = linkedUnit.downPaymentPct.toStringAsFixed(0);
        }
        if (linkedUnit.installmentYears > 0) {
          _installmentYearsCtrl.text = linkedUnit.installmentYears.toString();
        }
        if ([1, 2, 4, 12].contains(linkedUnit.installmentFrequency)) {
          _installmentFrequency = linkedUnit.installmentFrequency;
        }
      } else {
        final budget = lead.budgetMax ?? lead.budgetMin ?? 0;
        if (budget > 0 && _meterPriceCtrl.text.isEmpty && _totalMetersCtrl.text.isEmpty) {
          const defaultArea = 150;
          _totalMetersCtrl.text = defaultArea.toString();
          _meterPriceCtrl.text = (budget / defaultArea).round().toString();
        }
      }
    });
  }

  void _resetAll() {
    setState(() {
      _meterPriceCtrl.clear();
      _totalMetersCtrl.clear();
      _maintenanceMode = 'pct';
      _maintPctCtrl.text = '8';
      _maintFixedCtrl.clear();
      _downPaymentMode = 'pct';
      _downPctCtrl.text = '10';
      _downFixedCtrl.clear();
      _handoverMode = 'pct';
      _handoverPctCtrl.text = '0';
      _handoverFixedCtrl.clear();
      _discountMode = 'pct';
      _discountPctCtrl.text = '0';
      _discountFixedCtrl.clear();
      _garageFeeCtrl.text = '0';
      _installmentYearsCtrl.text = '8';
      _installmentFrequency = 12;
      _selectedLead = null;
    });
  }

  double _parseNum(TextEditingController c) {
    final v = double.tryParse(c.text.replaceAll(',', '').trim()) ?? 0.0;
    return v.isFinite && v > 0 ? v : 0.0;
  }

  /// Exact calculation engine cloned from `src/app/calculator/components/UnitPriceCalculator.tsx`
  Map<String, dynamic> _calculateResult() {
    final meterPrice = _parseNum(_meterPriceCtrl);
    final totalMeters = _parseNum(_totalMetersCtrl);
    final maintPct = _parseNum(_maintPctCtrl);
    final maintFixed = _parseNum(_maintFixedCtrl);
    final downPct = _parseNum(_downPctCtrl);
    final downFixed = _parseNum(_downFixedCtrl);
    final handoverPct = _parseNum(_handoverPctCtrl);
    final handoverFixed = _parseNum(_handoverFixedCtrl);
    final discountPct = _parseNum(_discountPctCtrl);
    final discountFixed = _parseNum(_discountFixedCtrl);
    final garageFee = _parseNum(_garageFeeCtrl);
    final years = _parseNum(_installmentYearsCtrl);
    final freq = _installmentFrequency > 0 ? _installmentFrequency : 12;

    final unitValue = meterPrice * totalMeters;
    final maint = _maintenanceMode == 'pct' ? (unitValue * maintPct) / 100.0 : maintFixed;
    final discount = _discountMode == 'pct'
        ? (unitValue * math.min(100.0, discountPct)) / 100.0
        : discountFixed;

    final totalPrice = math.max(0.0, unitValue - discount + maint + garageFee);
    final down = _downPaymentMode == 'pct' ? (totalPrice * downPct) / 100.0 : downFixed;
    final handover = _handoverMode == 'pct' ? (totalPrice * handoverPct) / 100.0 : handoverFixed;
    final remaining = totalPrice - down - handover;
    final count = math.max(0, (years * freq).round());
    final eachInstallment = count > 0 ? math.max(0.0, remaining) / count : 0.0;
    final valid = meterPrice > 0 && totalMeters > 0;
    final overAllocated = remaining < 0;

    return {
      'unitValue': unitValue,
      'maint': maint,
      'garageFee': garageFee,
      'discount': discount,
      'totalPrice': totalPrice,
      'down': down,
      'handover': handover,
      'remaining': remaining,
      'count': count,
      'eachInstallment': eachInstallment,
      'valid': valid,
      'overAllocated': overAllocated,
      'totalMeters': totalMeters,
      'years': years,
    };
  }

  /// Exact recommendation scoring engine cloned from `UnitPriceCalculator.tsx`
  List<_ScoredUnitRecommendation> _computeRecommendations(Map<String, dynamic> calc) {
    if (calc['valid'] != true) return [];
    final targetArea = (calc['totalMeters'] as double?) ?? 0.0;
    final targetPrice = (calc['totalPrice'] as double?) ?? 0.0;
    final targetYears = (calc['years'] as double?) ?? 0.0;

    final scored = <_ScoredUnitRecommendation>[];

    for (final u in _units) {
      if (u.status != 'Available') continue;
      final uPrice = u.price;
      final uArea = u.area;
      if (uPrice <= 0 && uArea <= 0) continue;

      final priceDiffPct = targetPrice > 0 && uPrice > 0
          ? (uPrice - targetPrice).abs() / targetPrice
          : 1.0;
      final areaDiffPct = targetArea > 0 && uArea > 0
          ? (uArea - targetArea).abs() / targetArea
          : 1.0;

      if (priceDiffPct > 0.35 && areaDiffPct > 0.35) continue;

      double score = 0;
      final reasons = <String>[];

      if (targetPrice > 0 && uPrice > 0) {
        final s = math.max(0.0, 1.0 - priceDiffPct / 0.35) * 50.0;
        score += s;
        if (priceDiffPct <= 0.15) reasons.add('Close to calculated price');
      }
      if (targetArea > 0 && uArea > 0) {
        final s = math.max(0.0, 1.0 - areaDiffPct / 0.35) * 35.0;
        score += s;
        if (areaDiffPct <= 0.15) reasons.add('Similar area (${uArea.toStringAsFixed(0)} m²)');
      }
      if (targetYears > 0 && u.installmentYears > 0) {
        final yDiff = (u.installmentYears - targetYears).abs();
        final s = math.max(0.0, 1.0 - yDiff / math.max(1.0, targetYears)) * 15.0;
        score += s;
        if (yDiff <= 1) reasons.add('${u.installmentYears}-yr payment plan');
      }

      if (_selectedLead != null) {
        final leadProj = (_selectedLead!.project ?? '').toLowerCase().trim();
        final uProj = u.projectName.toLowerCase().trim();
        if (leadProj.isNotEmpty && uProj.isNotEmpty && uProj == leadProj) {
          score += 25;
          reasons.add('Matches lead project (${u.projectName})');
        }

        final leadType = (_selectedLead!.propertyType ?? '').toLowerCase().trim();
        final uType = u.unitType.toLowerCase().trim();
        if (leadType.isNotEmpty &&
            uType.isNotEmpty &&
            (uType.contains(leadType) || leadType.contains(uType))) {
          score += 15;
          reasons.add('Matches preferred type (${u.unitType})');
        }

        final bMin = _selectedLead!.budgetMin ?? 0;
        final bMax = _selectedLead!.budgetMax ?? 0;
        if (uPrice > 0 && (bMin > 0 || bMax > 0)) {
          final low = bMin > 0 ? bMin * 0.85 : 0.0;
          final high = bMax > 0 ? bMax * 1.15 : double.infinity;
          if (uPrice >= low && uPrice <= high) {
            score += 20;
            reasons.add('Within lead budget');
          }
        }
      }

      final matchPct = math.min(100, score.round());
      if (matchPct >= 25) {
        scored.add(_ScoredUnitRecommendation(
          unit: u,
          score: matchPct,
          reasons: reasons,
        ));
      }
    }

    scored.sort((a, b) => b.score.compareTo(a.score));
    return scored.take(6).toList();
  }

  void _openLeadPickerSheet(List<LeadModel> leads, bool isDark) {
    String query = '';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF141820) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final q = query.trim().toLowerCase();
            final filtered = q.isEmpty
                ? leads.take(30).toList()
                : leads
                    .where((l) =>
                        l.name.toLowerCase().contains(q) ||
                        l.phone.toLowerCase().contains(q) ||
                        (l.project ?? '').toLowerCase().contains(q))
                    .take(30)
                    .toList();

            return DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.65,
              maxChildSize: 0.9,
              minChildSize: 0.4,
              builder: (_, scrollController) {
                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Select Customer / Lead',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(LucideIcons.x, size: 18),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        autofocus: true,
                        onChanged: (v) => setSheetState(() => query = v),
                        decoration: InputDecoration(
                          hintText: 'Search by name, phone, or project…',
                          prefixIcon: const Icon(LucideIcons.search, size: 16),
                          isDense: true,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Expanded(
                        child: filtered.isEmpty
                            ? const Center(child: Text('No matching leads found'))
                            : ListView.separated(
                                controller: scrollController,
                                itemCount: filtered.length,
                                separatorBuilder: (_, __) => const Divider(height: 1),
                                itemBuilder: (_, idx) {
                                  final l = filtered[idx];
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                      radius: 16,
                                      backgroundColor: AppColors.neonLime.withAlpha(30),
                                      child: Text(
                                        l.name.isNotEmpty ? l.name[0].toUpperCase() : 'L',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: AppColors.neonLime,
                                        ),
                                      ),
                                    ),
                                    title: Text(
                                      l.name.isNotEmpty ? l.name : 'Unnamed Lead',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    subtitle: Text(
                                      '${l.phone}${l.project != null && l.project!.isNotEmpty ? " · ${l.project}" : ""}',
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    onTap: () {
                                      Navigator.pop(ctx);
                                      _onSelectLead(l);
                                    },
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  void _openUnitDetailsSheet(_ScoredUnitRecommendation rec, List<LeadModel> leads) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RecommendedUnitDetailsSheet(
        unit: rec.unit,
        project: _projects[rec.unit.projectId],
        matchPct: rec.score,
        reasons: rec.reasons,
        lead: _selectedLead,
        allLeads: leads,
        imageUrl: _unitImages[rec.unit.id],
        unitsService: _unitsService,
        onReserved: () => _loadInventory(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final leadsProvider = context.watch<LeadsProvider>();
    final calc = _calculateResult();
    final recommendations = _computeRecommendations(calc);
    final freqLabel = _frequencyLabels[_installmentFrequency] ?? 'Monthly';

    final content = RefreshIndicator(
      onRefresh: _loadInventory,
      color: AppColors.neonLime,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: [
          // ── 1. Header Card ────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF161920) : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.neonLime.withAlpha(30),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.neonLime.withAlpha(90)),
                  ),
                  child: const Icon(LucideIcons.calculator, color: AppColors.neonLime, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Unit Price Calculator',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Live installment plans & smart inventory matching',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: _resetAll,
                  icon: const Icon(LucideIcons.rotateCcw, size: 13),
                  label: const Text('Reset', style: TextStyle(fontSize: 11.5)),
                  style: OutlinedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── 2. Inputs Card ────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF161920) : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Customer / Lead Selector
                Row(
                  children: [
                    const Icon(LucideIcons.userCheck, size: 14, color: AppColors.neonLime),
                    const SizedBox(width: 6),
                    Text(
                      'CUSTOMER (OPTIONAL)',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                InkWell(
                  onTap: () => _openLeadPickerSheet(leadsProvider.leads, isDark),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _selectedLead != null
                            ? AppColors.neonLime.withAlpha(120)
                            : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          LucideIcons.search,
                          size: 15,
                          color: _selectedLead != null ? AppColors.neonLime : const Color(0xFF94A3B8),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _selectedLead != null
                                ? '${_selectedLead!.name} · ${_selectedLead!.phone}${_selectedLead!.project != null ? " (${_selectedLead!.project})" : ""}'
                                : 'Select lead to tailor unit recommendations…',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight:
                                  _selectedLead != null ? FontWeight.w700 : FontWeight.w500,
                              color: _selectedLead != null
                                  ? (isDark ? Colors.white : const Color(0xFF0F172A))
                                  : const Color(0xFF94A3B8),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (_selectedLead != null)
                          GestureDetector(
                            onTap: () => setState(() => _selectedLead = null),
                            child: const Icon(LucideIcons.x, size: 16, color: Color(0xFF94A3B8)),
                          )
                        else
                          const Icon(LucideIcons.chevronDown, size: 16, color: Color(0xFF94A3B8)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),

                // Price per m² & Total area (m²)
                Row(
                  children: [
                    Expanded(
                      child: _buildLabeledInput(
                        label: 'PRICE PER M²',
                        suffix: 'EGP',
                        hint: 'e.g. 45000',
                        controller: _meterPriceCtrl,
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildLabeledInput(
                        label: 'TOTAL AREA',
                        suffix: 'm²',
                        hint: 'e.g. 160',
                        controller: _totalMetersCtrl,
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Maintenance & Down Payment (% vs Fixed)
                Row(
                  children: [
                    Expanded(
                      child: _buildToggleableInput(
                        label: 'MAINTENANCE',
                        mode: _maintenanceMode,
                        onModeChanged: (m) => setState(() => _maintenanceMode = m),
                        pctController: _maintPctCtrl,
                        fixedController: _maintFixedCtrl,
                        pctHint: '8',
                        fixedHint: 'e.g. 250000',
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildToggleableInput(
                        label: 'DOWN PAYMENT',
                        mode: _downPaymentMode,
                        onModeChanged: (m) => setState(() => _downPaymentMode = m),
                        pctController: _downPctCtrl,
                        fixedController: _downFixedCtrl,
                        pctHint: '10',
                        fixedHint: 'e.g. 720000',
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Handover Payment & Discount (% vs Fixed)
                Row(
                  children: [
                    Expanded(
                      child: _buildToggleableInput(
                        label: 'HANDOVER',
                        mode: _handoverMode,
                        onModeChanged: (m) => setState(() => _handoverMode = m),
                        pctController: _handoverPctCtrl,
                        fixedController: _handoverFixedCtrl,
                        pctHint: '0',
                        fixedHint: 'e.g. 300000',
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildToggleableInput(
                        label: 'DISCOUNT',
                        mode: _discountMode,
                        onModeChanged: (m) => setState(() => _discountMode = m),
                        pctController: _discountPctCtrl,
                        fixedController: _discountFixedCtrl,
                        pctHint: '0',
                        fixedHint: 'e.g. 150000',
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Garage Fee & Installment Years
                Row(
                  children: [
                    Expanded(
                      child: _buildLabeledInput(
                        label: 'GARAGE / PARKING',
                        suffix: 'EGP',
                        hint: '0',
                        controller: _garageFeeCtrl,
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildLabeledInput(
                        label: 'INSTALLMENT YEARS',
                        suffix: 'yrs',
                        hint: '8',
                        controller: _installmentYearsCtrl,
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Installment Frequency Selector
                Text(
                  'INSTALLMENT FREQUENCY',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _buildFrequencyChip(12, 'Monthly', '12 /yr', isDark),
                    const SizedBox(width: 6),
                    _buildFrequencyChip(4, 'Quarterly', '4 /yr', isDark),
                    const SizedBox(width: 6),
                    _buildFrequencyChip(2, 'Semi-annual', '2 /yr', isDark),
                    const SizedBox(width: 6),
                    _buildFrequencyChip(1, 'Annual', '1 /yr', isDark),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── 3. Live Breakdown Card ────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF161920) : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Total Price Hero Banner
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isDark
                          ? [const Color(0xFF1B2B12), const Color(0xFF121820)]
                          : [const Color(0xFFECFCCB), const Color(0xFFF8FAFC)],
                    ),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.neonLime.withAlpha(90)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'TOTAL PRICE',
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.8,
                          color: AppColors.neonLime,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        calc['valid'] == true
                            ? 'EGP ${_fmt.format((calc['totalPrice'] as double).round())}'
                            : '—',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Unit value − discount + maintenance + garage',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // 7 Breakdown Items Grid
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 2.3,
                  children: [
                    _buildBreakdownBox(
                      title: 'UNIT VALUE',
                      subtitle: 'm² × price',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format((calc['unitValue'] as double).round())}'
                          : '—',
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'MAINTENANCE',
                      subtitle: _maintenanceMode == 'pct'
                          ? '${_parseNum(_maintPctCtrl).toStringAsFixed(0)}% of unit'
                          : 'Fixed',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format((calc['maint'] as double).round())}'
                          : '—',
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'GARAGE FEE',
                      subtitle: 'Fixed',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format((calc['garageFee'] as double).round())}'
                          : '—',
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'DISCOUNT',
                      subtitle: _discountMode == 'pct'
                          ? '${_parseNum(_discountPctCtrl).toStringAsFixed(0)}% of unit'
                          : 'Fixed',
                      value: calc['valid'] == true
                          ? '- EGP ${_fmt.format((calc['discount'] as double).round())}'
                          : '—',
                      valueColor: const Color(0xFF10B981),
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'DOWN PAYMENT',
                      subtitle: _downPaymentMode == 'pct'
                          ? '${_parseNum(_downPctCtrl).toStringAsFixed(0)}% of total'
                          : 'Fixed',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format((calc['down'] as double).round())}'
                          : '—',
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'HANDOVER',
                      subtitle: _handoverMode == 'pct'
                          ? '${_parseNum(_handoverPctCtrl).toStringAsFixed(0)}% of total'
                          : 'Fixed',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format((calc['handover'] as double).round())}'
                          : '—',
                      isDark: isDark,
                    ),
                    _buildBreakdownBox(
                      title: 'REMAINING',
                      subtitle: 'To finance',
                      value: calc['valid'] == true
                          ? 'EGP ${_fmt.format(math.max(0, (calc['remaining'] as double).round()))}'
                          : '—',
                      isDark: isDark,
                    ),
                  ],
                ),

                if (calc['overAllocated'] == true) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEF4444).withAlpha(25),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFEF4444).withAlpha(80)),
                    ),
                    child: const Text(
                      'Down payment + handover exceed the total price — adjust your inputs.',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFEF4444),
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 12),

                // Each Installment Highlight Box
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.neonLime.withAlpha(120)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'EACH ${freqLabel.toUpperCase()} INSTALLMENT',
                            style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: AppColors.neonLime,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            calc['valid'] == true && (calc['count'] as int) > 0
                                ? 'EGP ${_fmt.format((calc['eachInstallment'] as double).round())}'
                                : '—',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            'COUNT',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            calc['valid'] == true ? '${calc['count']} payments' : '—',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 10),
                // Formula Reference Note
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(LucideIcons.info, size: 14, color: AppColors.neonLime),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Total = (m² × price − discount) + maintenance + garage\nInstallment = (Total − down payment − handover) ÷ (years × frequency)',
                          style: TextStyle(
                            fontSize: 10.5,
                            height: 1.4,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── 4. Recommended Units Section ──────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF161920) : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(LucideIcons.building2, size: 16, color: AppColors.neonLime),
                        const SizedBox(width: 8),
                        Text(
                          'Recommended Units',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: isDark ? Colors.white : const Color(0xFF0F172A),
                          ),
                        ),
                      ],
                    ),
                    if (_selectedLead != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF8B5CF6).withAlpha(30),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          'Scored for ${_selectedLead!.name}',
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF8B5CF6),
                          ),
                        ),
                      )
                    else if (_loadingUnits)
                      const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.neonLime),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (calc['valid'] != true)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Center(
                      child: Text(
                        'Enter a price per m² and an area to see matching units.',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                    ),
                  )
                else if (recommendations.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Center(
                      child: Text(
                        'No matching units found within ±35% of your inputs.',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                        ),
                      ),
                    ),
                  )
                else
                  ...recommendations.map((rec) => _buildRecommendedUnitCard(
                        rec,
                        leadsProvider.leads,
                        isDark,
                      )),
              ],
            ),
          ),
        ],
      ),
    );

    if (!widget.showAppBar) {
      return content;
    }

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0D10) : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Unit Calculator'),
      ),
      body: content,
    );
  }

  Widget _buildLabeledInput({
    required String label,
    required String suffix,
    required String hint,
    required TextEditingController controller,
    required bool isDark,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 5),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            hintText: hint,
            suffixText: suffix,
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            filled: true,
            fillColor: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildToggleableInput({
    required String label,
    required String mode,
    required ValueChanged<String> onModeChanged,
    required TextEditingController pctController,
    required TextEditingController fixedController,
    required String pctHint,
    required String fixedHint,
    required bool isDark,
  }) {
    final isPct = mode == 'pct';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                  color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Container(
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF0E1217) : const Color(0xFFE2E8F0),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildMiniToggle('%', isPct, () => onModeChanged('pct')),
                  _buildMiniToggle('EGP', !isPct, () => onModeChanged('fixed')),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        TextField(
          controller: isPct ? pctController : fixedController,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => setState(() {}),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            hintText: isPct ? pctHint : fixedHint,
            suffixText: isPct ? '%' : 'EGP',
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            filled: true,
            fillColor: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMiniToggle(String text, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: active ? AppColors.neonLime : Colors.transparent,
          borderRadius: BorderRadius.circular(5),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 9.5,
            fontWeight: FontWeight.w800,
            color: active ? const Color(0xFF142407) : const Color(0xFF94A3B8),
          ),
        ),
      ),
    );
  }

  Widget _buildFrequencyChip(int freq, String label, String sub, bool isDark) {
    final active = _installmentFrequency == freq;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _installmentFrequency = freq),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: active
                ? AppColors.neonLime
                : (isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC)),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active
                  ? AppColors.neonLime
                  : (isDark ? const Color(0xFF282D38) : AppColors.lightBorder),
            ),
          ),
          child: Column(
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: active
                      ? const Color(0xFF142407)
                      : (isDark ? Colors.white : const Color(0xFF0F172A)),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                sub,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: active ? const Color(0xFF142407) : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBreakdownBox({
    required String title,
    required String subtitle,
    required String value,
    required bool isDark,
    Color? valueColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                    color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 9, color: Color(0xFF64748B)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: valueColor ?? (isDark ? Colors.white : const Color(0xFF0F172A)),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildRecommendedUnitCard(
    _ScoredUnitRecommendation rec,
    List<LeadModel> leads,
    bool isDark,
  ) {
    final unit = rec.unit;
    final proj = _projects[unit.projectId];
    final imgUrl = _unitImages[unit.id];
    final sellingPoint = (proj != null && proj.sellingPoints.isNotEmpty)
        ? proj.sellingPoints.first
        : unit.notes;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
        ),
      ),
      child: InkWell(
        onTap: () => _openUnitDetailsSheet(rec, leads),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Thumbnail
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 74,
                  height: 74,
                  color: isDark ? const Color(0xFF161920) : const Color(0xFFE2E8F0),
                  child: imgUrl != null && imgUrl.isNotEmpty
                      ? Image.network(
                          imgUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const Icon(LucideIcons.building2, color: AppColors.neonLime),
                        )
                      : const Icon(LucideIcons.building2, color: AppColors.neonLime),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(
                          child: Text(
                            unit.name,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF7C3AED),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            '${rec.score}% Match',
                            style: const TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${unit.projectName.isNotEmpty ? unit.projectName : "Project"}${proj != null && proj.developerName.isNotEmpty ? " · ${proj.developerName}" : ""}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.neonLime,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'EGP ${_fmt.format(unit.price.round())}  •  ${unit.area.toStringAsFixed(0)} m²${unit.installmentYears > 0 ? "  •  ${unit.installmentYears} yrs" : ""}',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                      ),
                    ),
                    if (sellingPoint.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        sellingPoint,
                        style: const TextStyle(fontSize: 10.5, color: Color(0xFF94A3B8)),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(LucideIcons.chevronRight, size: 16, color: Color(0xFF94A3B8)),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecommendedUnitDetailsSheet extends StatefulWidget {
  final UnitModel unit;
  final ProjectModel? project;
  final int matchPct;
  final List<String> reasons;
  final LeadModel? lead;
  final List<LeadModel> allLeads;
  final String? imageUrl;
  final UnitsService unitsService;
  final VoidCallback onReserved;

  const _RecommendedUnitDetailsSheet({
    required this.unit,
    required this.project,
    required this.matchPct,
    required this.reasons,
    required this.lead,
    required this.allLeads,
    required this.imageUrl,
    required this.unitsService,
    required this.onReserved,
  });

  @override
  State<_RecommendedUnitDetailsSheet> createState() => _RecommendedUnitDetailsSheetState();
}

class _RecommendedUnitDetailsSheetState extends State<_RecommendedUnitDetailsSheet> {
  final NumberFormat _fmt = NumberFormat('#,##0', 'en_US');
  late String _status;
  LeadModel? _targetLead;
  bool _reserving = false;
  bool _addingToLead = false;
  List<UnitFileModel> _files = [];

  @override
  void initState() {
    super.initState();
    _status = widget.unit.status;
    _targetLead = widget.lead;
    _loadFiles();
  }

  Future<void> _loadFiles() async {
    final f = await widget.unitsService.getUnitFiles(widget.unit.id);
    if (mounted) {
      setState(() => _files = f);
    }
  }

  Future<void> _handleReserve() async {
    if (_status == 'Reserved' || _status == 'Sold') return;
    setState(() => _reserving = true);
    try {
      await widget.unitsService.reserveUnit(widget.unit, lead: _targetLead);
      if (mounted) {
        setState(() {
          _status = 'Reserved';
          _reserving = false;
        });
        widget.onReserved();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _targetLead != null
                  ? 'Reserved ${widget.unit.name} for ${_targetLead!.name}'
                  : 'Unit ${widget.unit.name} marked as Reserved',
            ),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _reserving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to reserve unit: $e')),
        );
      }
    }
  }

  Future<void> _handleAddToLead() async {
    if (_targetLead == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a customer/lead first to attach this unit')),
      );
      return;
    }
    setState(() => _addingToLead = true);
    try {
      await widget.unitsService.addRecommendedUnitToLead(_targetLead!.id, widget.unit.id);
      if (mounted) {
        setState(() => _addingToLead = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Added ${widget.unit.name} to ${_targetLead!.name}'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _addingToLead = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not add unit to lead: $e')),
        );
      }
    }
  }

  Future<void> _handleShareWhatsApp() async {
    final u = widget.unit;
    final p = widget.project;
    final greeting = WhatsAppUtils.buildDefaultLeadMessage(context);

    final lines = <String>[
      greeting,
      '',
      '🏢 *${u.name}*${u.projectName.isNotEmpty ? " — ${u.projectName}" : ""}',
      if (p != null && p.developerName.isNotEmpty) 'Developer: ${p.developerName}',
      if (p != null && p.location.isNotEmpty) '📍 Location: ${p.location}',
      if (u.unitType.isNotEmpty) 'Type: ${u.unitType}',
      if (u.area > 0) 'Area: ${u.area.toStringAsFixed(0)} m²',
      if (u.price > 0) '💰 Price: EGP ${_fmt.format(u.price.round())}',
      if (u.downPaymentPct > 0 || u.installmentYears > 0)
        'Payment Plan: ${u.downPaymentPct > 0 ? "${u.downPaymentPct.toStringAsFixed(0)}% down" : ""}${u.downPaymentPct > 0 && u.installmentYears > 0 ? " · " : ""}${u.installmentYears > 0 ? "${u.installmentYears} years" : ""}',
      if (p != null && p.sellingPoints.isNotEmpty)
        '✨ Highlights: ${p.sellingPoints.take(3).join(" • ")}',
    ];

    final fullMessage = lines.join('\n');
    final phone = _targetLead?.phone ?? '';

    if (phone.isNotEmpty) {
      await WhatsAppUtils.openWhatsAppChat(
        context,
        phone: phone,
        customMessage: fullMessage,
      );
    } else {
      final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(fullMessage)}');
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final u = widget.unit;
    final p = widget.project;
    final pricePerSqm = u.area > 0 && u.price > 0 ? (u.price / u.area).round() : 0;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.88,
      ),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF141820) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        u.name,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: isDark ? Colors.white : const Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        '${u.projectName}${p != null && p.developerName.isNotEmpty ? " · ${p.developerName}" : ""}',
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.neonLime,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF7C3AED),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${widget.matchPct}% Match',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(LucideIcons.x, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Key Unit Metrics
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF0E1217) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark ? const Color(0xFF282D38) : AppColors.lightBorder,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    u.price > 0 ? 'EGP ${_fmt.format(u.price.round())}' : 'Price on request',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 12,
                    runSpacing: 6,
                    children: [
                      if (u.unitType.isNotEmpty) _buildPill('Type: ${u.unitType}'),
                      if (u.area > 0) _buildPill('Area: ${u.area.toStringAsFixed(0)} m²'),
                      if (u.floor > 0) _buildPill('Floor: ${u.floor}'),
                      if (pricePerSqm > 0) _buildPill('EGP ${_fmt.format(pricePerSqm)}/m²'),
                      _buildPill('Status: $_status'),
                    ],
                  ),
                ],
              ),
            ),

            if (widget.reasons.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: widget.reasons
                    .map((r) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.neonLime.withAlpha(25),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '✓ $r',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.neonLime,
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ],

            if (p != null && (p.whyBuy.isNotEmpty || p.sellingPoints.isNotEmpty)) ...[
              const SizedBox(height: 12),
              Text(
                'Project Selling Points',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),
              if (p.whyBuy.isNotEmpty)
                Text(
                  p.whyBuy,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                ),
              ...p.sellingPoints.map(
                (pt) => Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('• $pt', style: const TextStyle(fontSize: 11.5)),
                ),
              ),
            ],

            if (_files.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Unit Brochures & Files (${_files.length})',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              ..._files.map(
                (f) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(LucideIcons.fileText, size: 16, color: AppColors.neonLime),
                  title: Text(f.fileName, style: const TextStyle(fontSize: 12)),
                  onTap: f.url != null
                      ? () => launchUrl(Uri.parse(f.url!), mode: LaunchMode.externalApplication)
                      : null,
                ),
              ),
            ],

            const SizedBox(height: 18),

            // 4 Quick Action Buttons (Reserve, Add to Lead, Log Call, Share via WhatsApp)
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 2.8,
              children: [
                ElevatedButton.icon(
                  onPressed: (_reserving || _status == 'Reserved') ? null : _handleReserve,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF59E0B),
                    foregroundColor: Colors.black,
                  ),
                  icon: const Icon(LucideIcons.bookmarkCheck, size: 15),
                  label: Text(
                    _status == 'Reserved' ? 'Reserved' : 'Reserve Unit',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _addingToLead ? null : _handleAddToLead,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF8B5CF6),
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(LucideIcons.userPlus, size: 15),
                  label: const Text(
                    'Add to Lead',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _targetLead == null
                      ? null
                      : () {
                          Navigator.pop(context);
                          LogCallDialog.show(context, lead: _targetLead!);
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF3B82F6),
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(LucideIcons.phoneCall, size: 15),
                  label: const Text(
                    'Log Call',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _handleShareWhatsApp,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF25D366),
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(LucideIcons.messageCircle, size: 15),
                  label: const Text(
                    'WhatsApp Offer',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white10,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/constants/lead_stages.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/tr.dart';
import '../../core/utils/phone_utils.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../core/widgets/premium.dart';
import '../../data/models/lead_model.dart';
import '../../data/services/leads_service.dart' show DuplicateLeadException, LeadsService;
import '../../data/models/user_profile_model.dart';
import '../../data/services/supabase_service.dart';
import '../../data/services/users_service.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';

/// Add a lead in seconds: phone + source are the only required fields; everything else is optional
/// and folded under "More details". Save is always visible at the bottom.
class AddLeadScreen extends StatefulWidget {
  const AddLeadScreen({super.key});

  @override
  State<AddLeadScreen> createState() => _AddLeadScreenState();
}

class _AddLeadScreenState extends State<AddLeadScreen> {
  final SupabaseClient _client = SupabaseService().client;

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _secondaryPhoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _notesController = TextEditingController();
  final _newSourceController = TextEditingController();

  String _countryCode = '+20';
  static const _countryCodes = [('+20', '🇪🇬'), ('+971', '🇦🇪'), ('+966', '🇸🇦'), ('+974', '🇶🇦')];

  String? _selectedSource = 'Facebook';
  List<String> _sources = ['Facebook', 'Instagram', 'TikTok', 'WhatsApp', 'Website', 'Referral', 'Sales Referral', 'Walk-in', 'Cold Dial', 'Other'];
  bool _isAddingSource = false;

  String? _selectedProject;
  List<String> _projectOptions = [];
  String? _selectedCategory;
  String? _selectedBedrooms;
  String? _selectedBudget; // '3-5', '5-10', '10+'

  String _stage = 'Fresh Leads';
  // Every stage the website offers (Duplicate Leads is set by the system, not by hand).
  static const _pipelineStages = LeadStages.pipelineStages;
  static final _outcomeStages = LeadStages.outcomeStages.where((s) => s != 'Duplicate Leads').toList();
  final _actionNoteController = TextEditingController();

  /// null = nobody (unassigned, same default as before).
  String? _assignedToId;
  String? _assignedToName;
  List<UserProfileModel> _assignableUsers = [];

  String? _schedule; // null, 'today', 'tomorrow', 'custom'
  DateTime? _customDate;

  bool _showMore = false;
  bool _isSubmitting = false;
  String? _phoneError;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    try {
      final users = await UsersService().getAssignableUsers();
      if (mounted) setState(() => _assignableUsers = users);
    } catch (_) {}

    try {
      final projRes = await _client.from('projects').select('name, developer_name').order('name', ascending: true).limit(200);
      final live = <String>[];
      for (final raw in (projRes as List<dynamic>)) {
        final row = raw as Map<String, dynamic>;
        final name = row['name']?.toString().trim() ?? '';
        final dev = row['developer_name']?.toString().trim() ?? '';
        if (name.isNotEmpty) live.add(dev.isNotEmpty ? '$name - $dev' : name);
      }
      if (mounted) setState(() => _projectOptions = live);
    } catch (_) {}

    try {
      final srcRes = await _client.from('lead_sources').select('name').eq('is_active', true).order('name', ascending: true);
      final live = <String>[];
      for (final raw in (srcRes as List<dynamic>)) {
        final name = (raw as Map<String, dynamic>)['name']?.toString().trim() ?? '';
        if (name.isNotEmpty) live.add(name);
      }
      if (live.isNotEmpty && mounted) {
        setState(() {
          _sources = {..._sources, ...live}.toList();
          if (_selectedSource != null && !_sources.contains(_selectedSource)) {
            _selectedSource = _sources.firstWhere((s) => s.toLowerCase() == _selectedSource!.toLowerCase(), orElse: () => _sources.first);
          }
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _secondaryPhoneController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    _actionNoteController.dispose();
    _newSourceController.dispose();
    super.dispose();
  }

  // A number that already carries its own country code (966…, +971…) is never given the dropdown's code on top.
  String _buildFullPhone() => PhoneUtils.fromAddLead(_phoneController.text, _countryCode);

  Future<void> _createCustomSource() async {
    final name = _newSourceController.text.trim();
    if (name.length < 2) return;
    setState(() => _isAddingSource = true);
    try {
      await _client.from('lead_sources').insert({'name': name, 'is_active': true});
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      if (!_sources.contains(name)) _sources = [name, ..._sources];
      _selectedSource = name;
      _newSourceController.clear();
      _isAddingSource = false;
    });
    Navigator.of(context).maybePop();
  }

  Future<void> _submit({bool launchWhatsAppAfter = false}) async {
    if (_isSubmitting) return;
    final digits = _phoneController.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 8) {
      setState(() => _phoneError = tr('Enter a phone number (at least 8 digits)', 'اكتب رقم التليفون (8 أرقام على الأقل)'));
      return;
    }
    if (_selectedSource == null || _selectedSource!.trim().isEmpty) {
      showAppSnack(context, tr('Pick where the lead came from', 'اختار مصدر العميل'), error: true);
      return;
    }
    setState(() {
      _isSubmitting = true;
      _phoneError = null;
    });

    final fullPhone = _buildFullPhone();
    final enteredName = _nameController.text.trim();
    final resolvedName = enteredName.isNotEmpty ? enteredName : 'Lead $fullPhone';

    String? propertyType;
    if (_selectedCategory != null && _selectedBedrooms != null) {
      propertyType = '$_selectedBedrooms $_selectedCategory';
    } else if (_selectedCategory != null) {
      propertyType = _selectedCategory;
    } else if (_selectedBedrooms != null) {
      propertyType = '$_selectedBedrooms Apartment';
    }

    final (budgetMin, budgetMax) = switch (_selectedBudget) {
      '3-5' => (3000000.0, 5000000.0),
      '5-10' => (5000000.0, 10000000.0),
      '10+' => (10000000.0, 25000000.0),
      _ => (null, null),
    };

    final now = DateTime.now();
    final String? followUpDue = switch (_schedule) {
      'today' => DateFormat('yyyy-MM-dd').format(now),
      'tomorrow' => DateFormat('yyyy-MM-dd').format(now.add(const Duration(days: 1))),
      'custom' when _customDate != null => DateFormat('yyyy-MM-dd').format(_customDate!),
      _ => null,
    };

    final notesParts = <String>[
      if (_secondaryPhoneController.text.trim().isNotEmpty) 'Secondary Phone: ${_secondaryPhoneController.text.trim()}',
      if (_notesController.text.trim().isNotEmpty) _notesController.text.trim(),
    ];


    final lead = LeadModel(
      id: '',
      name: resolvedName,
      phone: fullPhone,
      email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
      propertyType: propertyType,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      source: _selectedSource!,
      status: _stage,
      project: _selectedProject,
      unit: _selectedBedrooms,
      assignedTo: _assignedToId,
      followUpDue: followUpDue,
      notes: notesParts.isEmpty ? null : notesParts.join('\n'),
    );

    try {
      final provider = context.read<LeadsProvider>();
      final created = await provider.createLead(lead);
      // A note written while adding the lead counts as an action: it is saved as a lead comment, which the
      // leaderboard counts. The "Action note" is also appended to the lead's notes (addNote). The longer "Notes"
      // field (more details) is already in the lead's notes, so for it only the comment is added. Several notes
      // within two minutes still count as one action.
      final actionNote = _actionNoteController.text.trim();
      final moreNotes = _notesController.text.trim();
      var noteSaved = true;
      if (created.id.isNotEmpty && (actionNote.isNotEmpty || moreNotes.isNotEmpty)) {
        try {
          if (actionNote.isNotEmpty) {
            await provider.addNote(created.id, actionNote);
          } else {
            await LeadsService().addComment(created.id, moreNotes);
          }
        } catch (_) {
          noteSaved = false;
        }
      }
      tapFeedback();
      if (!mounted) return;
      if (launchWhatsAppAfter) await WhatsAppUtils.openWhatsAppChat(context, phone: fullPhone);
      if (!mounted) return;
      showAppSnack(
        context,
        noteSaved
            ? tr('Lead "$resolvedName" added', 'اتضاف "$resolvedName"')
            : tr('Lead "$resolvedName" added, but its note was not saved as an action', 'اتضاف "$resolvedName" بس النوتة متسجلتش كإجراء'),
        error: !noteSaved,
      );
      Navigator.pop(context);
    } on DuplicateLeadException catch (d) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      await _showDuplicate(d.existing, resolvedName, fullPhone);
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      showAppSnack(context, e.toString().replaceAll('Exception: ', ''), error: true);
    }
  }

  /// The phone already exists: nothing was added. Owner/admin see which lead it matched.
  Future<void> _showDuplicate(Map<String, dynamic>? existing, String name, String phone) {
    final t = Theme.of(context).textTheme;
    Widget row(String label, String? value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 90, child: Text(label, style: t.bodySmall)),
            Expanded(child: Text((value ?? '').isEmpty ? '—' : value!, style: t.titleSmall)),
          ]),
        );
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('This lead already exists', 'العميل ده موجود قبل كده')),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tr('$name ($phone) was not added. The attempt was saved for the admins.',
              '$name ($phone) ما اتضافش. المحاولة اتسجلت للإدارة.')),
          if (existing != null) ...[
            const SizedBox(height: AppSpacing.md),
            row(tr('Lead', 'العميل'), existing['name']?.toString()),
            row(tr('Phone', 'الرقم'), existing['phone']?.toString()),
            row(tr('Owner', 'المسؤول'), existing['owner']?.toString()),
            row(tr('Stage', 'المرحلة'), existing['stage']?.toString()),
            row(tr('Added on', 'اتضاف'), existing['addedOn']?.toString()),
          ],
        ]),
        actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('OK', 'تمام')))],
      ),
    );
  }

  // ── Pickers ────────────────────────────────────────────────────────

  Future<void> _pickFromList({required String title, required List<String> options, required ValueChanged<String> onPick, Widget? footer}) {
    return showPremiumSheet<void>(context, builder: (ctx) => _SearchList(title: title, options: options, onPick: (v) {
          onPick(v);
          Navigator.pop(ctx);
        }, footer: footer));
  }

  void _pickSource() => _pickFromList(
        title: tr('Lead source', 'مصدر العميل'),
        options: _sources,
        onPick: (v) => setState(() => _selectedSource = v),
        footer: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _newSourceController,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(hintText: tr('New source name', 'اسم مصدر جديد')),
                onSubmitted: (_) => _createCustomSource(),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            AppButton(tr('Add', 'ضيف'), loading: _isAddingSource, onPressed: _createCustomSource),
          ]),
        ),
      );

  void _pickProject() => _pickFromList(
        title: tr('Project', 'المشروع'),
        options: _projectOptions,
        onPick: (v) => setState(() => _selectedProject = v),
      );

  void _pickAssignee() {
    final me = context.read<AuthProvider>().profile;
    showPremiumSheet<void>(context, builder: (ctx) {
      Widget tile(String title, String? sub, VoidCallback onTap, {bool selected = false}) => ListTile(
            minTileHeight: AppSpacing.tap + 8,
            title: Text(title),
            subtitle: sub == null ? null : Text(sub),
            trailing: selected ? Icon(LucideIcons.check, color: ctx.palette.accent) : null,
            onTap: () {
              onTap();
              Navigator.pop(ctx);
            },
          );
      return SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.7,
        child: ListView(padding: const EdgeInsets.fromLTRB(8, 12, 8, 24), children: [
          Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 8), child: Text(tr('Assign to', 'تعيين لـ'), style: Theme.of(ctx).textTheme.titleLarge)),
          tile(tr('Nobody yet', 'لسه محدش'), null, () => setState(() {
                _assignedToId = null;
                _assignedToName = null;
              }), selected: _assignedToId == null),
          if (me != null)
            tile('${tr('Me', 'أنا')} (${me.fullName})', null, () => setState(() {
                  _assignedToId = me.id;
                  _assignedToName = me.fullName;
                }), selected: _assignedToId == me.id),
          const Divider(),
          for (final u in _assignableUsers.where((u) => u.id != me?.id))
            tile(u.fullName, u.role, () => setState(() {
                  _assignedToId = u.id;
                  _assignedToName = u.fullName;
                }), selected: _assignedToId == u.id),
        ]),
      );
    });
  }

  Future<void> _pickCustomDate() async {
    final today = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _customDate ?? today.add(const Duration(days: 1)),
      firstDate: DateTime(today.year, today.month, today.day),
      lastDate: today.add(const Duration(days: 365)),
    );
    if (d != null) {
      setState(() {
        _schedule = 'custom';
        _customDate = d;
      });
    }
  }

  // ── UI ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final t = Theme.of(context).textTheme;
    final assigneeLabel = _assignedToName ?? tr('Nobody yet', 'لسه محدش');

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('New lead', 'عميل جديد')),
        leading: IconButton(tooltip: tr('Close', 'إغلاق'), icon: const Icon(LucideIcons.x), onPressed: () => Navigator.maybePop(context)),
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 120),
          children: [
            // 1. Contact — the only required part
            _Section(title: tr('Contact', 'بيانات التواصل'), children: [
              _Label(tr('Phone', 'رقم التليفون'), required: true),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                  width: 112,
                  child: DropdownButtonFormField<String>(
                    initialValue: _countryCode,
                    isExpanded: true,
                    items: [for (final c in _countryCodes) DropdownMenuItem(value: c.$1, child: Text('${c.$2} ${c.$1}', textDirection: TextDirection.ltr))],
                    onChanged: (v) => setState(() => _countryCode = v ?? '+20'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: TextField(
                    controller: _phoneController,
                    autofocus: true,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
                    textDirection: TextDirection.ltr,
                    style: t.bodyLarge,
                    onChanged: (_) {
                      if (_phoneError != null) setState(() => _phoneError = null);
                    },
                    decoration: InputDecoration(hintText: '01x xxxx xxxx', errorText: _phoneError, errorMaxLines: 2),
                  ),
                ),
              ]),
              const SizedBox(height: AppSpacing.md),
              _Label(tr('Name', 'الاسم')),
              TextField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.name],
                style: t.bodyLarge,
                decoration: InputDecoration(hintText: tr('Optional', 'اختياري')),
              ),
            ]),

            // 2. Source — required
            _Section(title: tr('Source', 'المصدر'), required: true, children: [
              _ChipWrap(
                options: {..._sources.take(6), if (_selectedSource != null) _selectedSource!}.toList(),
                selected: _selectedSource,
                onSelected: (v) => setState(() => _selectedSource = v),
                trailing: ActionChip(
                  avatar: const Icon(LucideIcons.ellipsis, size: 16),
                  label: Text(tr('More', 'المزيد')),
                  onPressed: _pickSource,
                ),
              ),
            ]),

            // 3. Stage
            _Section(title: tr('Stage', 'المرحلة'), children: [
              _Label(tr('Pipeline', 'مراحل البيع')),
              _ChipWrap(options: _pipelineStages, selected: _stage, onSelected: (v) => setState(() => _stage = v)),
              const SizedBox(height: AppSpacing.md),
              _Label(tr('Outcome', 'نتيجة التواصل')),
              _ChipWrap(options: _outcomeStages, selected: _stage, onSelected: (v) => setState(() => _stage = v)),
            ]),

            // 3b. Optional action note — what happened on the first contact
            _Section(title: tr('Note · counts as an action', 'نوتة · بتتحسب إجراء'), children: [
              TextField(
                controller: _actionNoteController,
                minLines: 2,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.newline,
                decoration: InputDecoration(
                  hintText: tr('Optional — e.g. called, interested in a 3BR, call back Sunday', 'اختياري — مثلاً: كلمته، مهتم بـ 3 غرف، يتكلم الحد'),
                ),
              ),
            ]),

            // 4. Next follow-up
            _Section(title: tr('First follow-up', 'أول متابعة'), children: [
              Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: [
                _choice(tr('None', 'بدون'), _schedule == null, () => setState(() => _schedule = null)),
                _choice(tr('Today', 'النهارده'), _schedule == 'today', () => setState(() => _schedule = 'today')),
                _choice(tr('Tomorrow', 'بكرة'), _schedule == 'tomorrow', () => setState(() => _schedule = 'tomorrow')),
                _choice(
                  _schedule == 'custom' && _customDate != null ? DateFormat('d MMM').format(_customDate!) : tr('Pick date', 'اختار تاريخ'),
                  _schedule == 'custom',
                  _pickCustomDate,
                  icon: LucideIcons.calendarDays,
                ),
              ]),
            ]),

            // 5. Assign
            _Section(title: tr('Assigned to', 'مسؤول عنه'), children: [
              _PickerField(icon: LucideIcons.userRound, value: assigneeLabel, onTap: _pickAssignee),
            ]),

            // 6. Optional details, folded
            PremiumCard(
              padding: EdgeInsets.zero,
              child: Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  initiallyExpanded: _showMore,
                  onExpansionChanged: (v) => setState(() => _showMore = v),
                  tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                  childrenPadding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
                  expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                  title: Text(tr('More details', 'تفاصيل إضافية'), style: t.titleMedium),
                  subtitle: Text(tr('Project, budget, unit, 2nd phone, notes', 'المشروع، الميزانية، الوحدة، رقم تاني، ملاحظات'), style: t.bodySmall),
                  children: [
                    _Label(tr('Project', 'المشروع')),
                    _PickerField(
                      icon: LucideIcons.building2,
                      value: _selectedProject ?? tr('Choose a project', 'اختار مشروع'),
                      muted: _selectedProject == null,
                      onTap: _pickProject,
                      onClear: _selectedProject == null ? null : () => setState(() => _selectedProject = null),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Budget (EGP)', 'الميزانية (جنيه)')),
                    _ChipWrap(
                      options: const ['3-5', '5-10', '10+'],
                      labelOf: (k) => switch (k) { '3-5' => '3M – 5M', '5-10' => '5M – 10M', _ => '10M+' },
                      selected: _selectedBudget,
                      onSelected: (v) => setState(() => _selectedBudget = _selectedBudget == v ? null : v),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Property type', 'نوع الوحدة')),
                    _ChipWrap(
                      options: const ['Apartment', 'Villa', 'Penthouse', 'Commercial', 'Off-Plan'],
                      selected: _selectedCategory,
                      onSelected: (v) => setState(() => _selectedCategory = _selectedCategory == v ? null : v),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Bedrooms', 'عدد الغرف')),
                    _ChipWrap(
                      options: const ['1 BR', '2 BR', '3 BR', '4+ BR'],
                      selected: _selectedBedrooms,
                      onSelected: (v) => setState(() => _selectedBedrooms = _selectedBedrooms == v ? null : v),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Second phone', 'رقم تاني')),
                    TextField(
                      controller: _secondaryPhoneController,
                      keyboardType: TextInputType.phone,
                      textDirection: TextDirection.ltr,
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Email', 'الإيميل')),
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textDirection: TextDirection.ltr,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _Label(tr('Notes · counts as an action', 'ملاحظات · بتتحسب إجراء')),
                    TextField(
                      controller: _notesController,
                      minLines: 3,
                      maxLines: 6,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(hintText: tr('What is the client looking for?', 'العميل بيدور على إيه؟')),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      // Sticky actions, reachable with one hand
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.md),
          decoration: BoxDecoration(color: p.card, border: Border(top: BorderSide(color: p.border))),
          child: Row(children: [
            SizedBox(
              height: AppSpacing.tap,
              child: OutlinedButton(
                onPressed: _isSubmitting ? null : () => _submit(launchWhatsAppAfter: true),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 14), minimumSize: const Size(AppSpacing.tap, AppSpacing.tap)),
                child: Semantics(label: tr('Save and open WhatsApp', 'حفظ وفتح واتساب'), child: Icon(LucideIcons.messageCircle, color: p.whatsapp)),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: AppButton(tr('Save lead', 'حفظ العميل'), icon: LucideIcons.check, loading: _isSubmitting, expand: true, onPressed: () => _submit()),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _choice(String label, bool selected, VoidCallback onTap, {IconData? icon}) {
    final p = context.palette;
    return ChoiceChip(
      label: Text(label),
      avatar: icon == null ? null : Icon(icon, size: 16, color: selected ? p.onAccent : p.subtext),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: p.accent,
      labelStyle: TextStyle(fontWeight: FontWeight.w600, color: selected ? p.onAccent : p.text),
      side: BorderSide(color: selected ? p.accent : p.border),
    );
  }
}

// ── Small building blocks ─────────────────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final bool required;
  final List<Widget> children;
  const _Section({required this.title, required this.children, this.required = false});

  @override
  Widget build(BuildContext context) {
    return PremiumCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          if (required) Text(' *', style: TextStyle(color: context.palette.danger, fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: AppSpacing.md),
        ...children,
      ]),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  final bool required;
  const _Label(this.text, {this.required = false});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text.rich(TextSpan(text: text, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: context.palette.subtext), children: [
          if (required) TextSpan(text: ' *', style: TextStyle(color: context.palette.danger)),
        ])),
      );
}

class _ChipWrap extends StatelessWidget {
  final List<String> options;
  final String? selected;
  final ValueChanged<String> onSelected;
  final String Function(String)? labelOf;
  final Widget? trailing;
  const _ChipWrap({required this.options, required this.selected, required this.onSelected, this.labelOf, this.trailing});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: [
      for (final o in options)
        ChoiceChip(
          label: Text(labelOf?.call(o) ?? o),
          selected: o == selected,
          onSelected: (_) => onSelected(o),
          selectedColor: p.accent,
          labelStyle: TextStyle(fontWeight: FontWeight.w600, color: o == selected ? p.onAccent : p.text),
          side: BorderSide(color: o == selected ? p.accent : p.border),
        ),
      if (trailing != null) trailing!,
    ]);
  }
}

class _PickerField extends StatelessWidget {
  final IconData icon;
  final String value;
  final VoidCallback onTap;
  final VoidCallback? onClear;
  final bool muted;
  const _PickerField({required this.icon, required this.value, required this.onTap, this.onClear, this.muted = false});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: p.card,
      shape: RoundedRectangleBorder(borderRadius: AppRadius.input, side: BorderSide(color: p.border)),
      child: InkWell(
        borderRadius: AppRadius.input,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(children: [
              Icon(icon, size: 18, color: p.subtext),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, color: muted ? p.subtext : p.text, fontWeight: FontWeight.w600))),
              if (onClear != null)
                IconButton(tooltip: tr('Clear', 'مسح'), onPressed: onClear, icon: Icon(LucideIcons.x, size: 16, color: p.subtext))
              else
                Icon(LucideIcons.chevronDown, size: 18, color: p.subtext),
            ]),
          ),
        ),
      ),
    );
  }
}

class _SearchList extends StatefulWidget {
  final String title;
  final List<String> options;
  final ValueChanged<String> onPick;
  final Widget? footer;
  const _SearchList({required this.title, required this.options, required this.onPick, this.footer});

  @override
  State<_SearchList> createState() => _SearchListState();
}

class _SearchListState extends State<_SearchList> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = q.isEmpty ? widget.options : widget.options.where((o) => o.toLowerCase().contains(q)).toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.md),
            AppSearchField(hint: tr('Search', 'بحث'), onChanged: (v) => setState(() => _q = v)),
          ]),
        ),
        Expanded(
          child: list.isEmpty
              ? EmptyState(icon: LucideIcons.searchX, title: tr('Nothing found', 'مفيش نتايج'))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemCount: list.length,
                  itemBuilder: (_, i) => ListTile(minTileHeight: AppSpacing.tap + 4, title: Text(list[i]), onTap: () => widget.onPick(list[i])),
                ),
        ),
        if (widget.footer != null) widget.footer!,
      ]),
    );
  }
}

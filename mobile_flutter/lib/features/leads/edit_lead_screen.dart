import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/premium.dart';
import '../../core/utils/note_formatter.dart';
import '../../core/utils/stage_note_guard.dart';
import '../../core/utils/tr.dart';
import '../../data/models/lead_model.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/leads_service.dart';
import '../../data/services/supabase_service.dart';
import '../../data/services/users_service.dart';
import '../../state/auth_provider.dart';

class EditLeadScreen extends StatefulWidget {
  final LeadModel lead;

  const EditLeadScreen({super.key, required this.lead});

  @override
  State<EditLeadScreen> createState() => _EditLeadScreenState();
}

class _EditLeadScreenState extends State<EditLeadScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _emailController;
  late final TextEditingController _projectController;
  late final TextEditingController _unitController;
  late final TextEditingController _locationController;
  late final TextEditingController _budgetMinController;
  late final TextEditingController _budgetMaxController;
  late final TextEditingController _notesController;
  late final ParsedNotes _parsedNotes;

  late String _status;
  String? _source;
  String? _propertyType;
  late String _priority;
  String? _assignedToId;

  bool _isSubmitting = false;
  List<UserProfileModel> _assignableUsers = [];

  List<String> _sources = [
    'Facebook',
    'Instagram',
    'TikTok',
    'WhatsApp',
    'Website',
    'Referral',
    'Sales Referral',
    'Walk-in',
    'Cold Dial',
    'Other',
  ];

  final List<String> _propertyTypes = [
    '1BHK Apartment',
    '2BHK Apartment',
    '3BHK Apartment',
    '4BHK Penthouse',
    'Villa',
    'Villa Plot',
    'Commercial Space',
    'Office Space',
  ];

  @override
  void initState() {
    super.initState();
    final l = widget.lead;
    _nameController = TextEditingController(text: l.name);
    _phoneController = TextEditingController(text: l.phone);
    _emailController = TextEditingController(text: l.email ?? '');
    _projectController = TextEditingController(text: l.project ?? '');
    _unitController = TextEditingController(text: l.unit ?? '');
    _locationController = TextEditingController(text: l.location ?? '');
    _budgetMinController = TextEditingController(text: l.budgetMin?.toString() ?? '');
    _budgetMaxController = TextEditingController(text: l.budgetMax?.toString() ?? '');
    _parsedNotes = NoteFormatter.parse(l.notes);
    _notesController = TextEditingController(text: _parsedNotes.humanText);

    _status = l.status;
    _source = l.source;
    _propertyType = l.propertyType;
    _priority = l.priority;
    _assignedToId = l.assignedTo;

    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    try {
      final users = await UsersService().getAssignableUsers();
      if (mounted) setState(() => _assignableUsers = users);
    } catch (_) {}

    try {
      final client = SupabaseService().client;
      final srcRes = await client
          .from('lead_sources')
          .select('name')
          .eq('is_active', true)
          .order('name', ascending: true);
      final liveSources = <String>[];
      for (final raw in (srcRes as List<dynamic>)) {
        final name = (raw as Map<String, dynamic>)['name']?.toString().trim() ?? '';
        if (name.isNotEmpty) liveSources.add(name);
      }
      if (liveSources.isNotEmpty && mounted) {
        setState(() {
          _sources = {...liveSources, ..._sources}.toList();
          if (_source != null && !_sources.contains(_source)) {
            final match = _sources.firstWhere(
              (s) => s.toLowerCase() == _source!.toLowerCase(),
              orElse: () => _source!,
            );
            _source = match;
          }
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _projectController.dispose();
    _unitController.dispose();
    _locationController.dispose();
    _budgetMinController.dispose();
    _budgetMaxController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final profile = context.read<AuthProvider>().profile;
    final canEditSource = profile?.isAdmin == true || profile?.isTeamLeader == true;

    setState(() => _isSubmitting = true);

    // Sales users cannot change a stage without a written note.
    if (_status != widget.lead.status && profile?.isAdmin != true) {
      final note = await StageNoteGuard.ask(context, leadName: widget.lead.name, stage: _status.toString());
      if (note == null || note.trim().isEmpty) {
        if (mounted) setState(() => _isSubmitting = false);
        return;
      }
      try {
        await LeadsService().addComment(widget.lead.id, note.trim());
      } catch (_) {
        if (mounted) {
          setState(() => _isSubmitting = false);
          showAppSnack(context, tr('Could not save the note, so the stage was not changed.', 'تعذّر حفظ الملاحظة، فلم تتغير المرحلة.'), error: true);
        }
        return;
      }
    }

    final updates = {
      'name': _nameController.text.trim(),
      'phone': _phoneController.text.trim(),
      'crm_status': _status,
      'email': _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
      'project': _projectController.text.trim().isNotEmpty ? _projectController.text.trim() : null,
      'unit': _unitController.text.trim().isNotEmpty ? _unitController.text.trim() : null,
      'location': _locationController.text.trim().isNotEmpty ? _locationController.text.trim() : null,
      'property_type': _propertyType,
      'budget_min': double.tryParse(_budgetMinController.text.trim()),
      'budget_max': double.tryParse(_budgetMaxController.text.trim()),
      'priority': _priority,
      'assigned_to': _assignedToId,
      // The call log lines the app wrote stay on the lead; only the person's own text was editable here.
      'notes': _parsedNotes.merge(_notesController.text).isNotEmpty ? _parsedNotes.merge(_notesController.text) : null,
    };
    if (canEditSource) {
      updates['source'] = _source;
    }

    try {
      await LeadsService().update(widget.lead.id, updates);
      if (mounted) {
        tapFeedback();
        showAppSnack(context, tr('Lead updated', 'اتحفظت التعديلات'));
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        showAppSnack(context, e.toString().replaceAll('Exception: ', ''), error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final profile = context.watch<AuthProvider>().profile;
    final canEditSource = profile?.isAdmin == true || profile?.isTeamLeader == true;
    const gap = SizedBox(height: AppSpacing.md);

    return Scaffold(
      appBar: AppBar(
        title: Text(tr('Edit lead', 'تعديل العميل')),
        leading: IconButton(tooltip: tr('Close', 'إغلاق'), icon: const Icon(LucideIcons.x), onPressed: () => Navigator.maybePop(context)),
      ),
      body: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.sm, AppSpacing.page, 120),
            children: [
              _Card(title: tr('Contact', 'بيانات التواصل'), children: [
                TextFormField(
                  controller: _nameController,
                  textCapitalization: TextCapitalization.words,
                  autofillHints: const [AutofillHints.name],
                  decoration: InputDecoration(labelText: '${tr('Name', 'الاسم')} *', prefixIcon: const Icon(LucideIcons.user, size: 18)),
                  validator: (v) => (v == null || v.trim().isEmpty) ? tr('Name is required', 'الاسم مطلوب') : null,
                ),
                gap,
                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(labelText: '${tr('Phone', 'التليفون')} *', prefixIcon: const Icon(LucideIcons.phone, size: 18)),
                  validator: (v) => (v == null || v.trim().isEmpty) ? tr('Phone is required', 'التليفون مطلوب') : null,
                ),
                gap,
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(labelText: tr('Email', 'الإيميل'), prefixIcon: const Icon(LucideIcons.mail, size: 18)),
                ),
                gap,
                TextFormField(
                  controller: _locationController,
                  decoration: InputDecoration(labelText: tr('Location', 'المنطقة'), prefixIcon: const Icon(LucideIcons.mapPin, size: 18)),
                ),
              ]),
              _Card(title: tr('Lead', 'العميل'), children: [
                DropdownButtonFormField<String>(
                  initialValue: _assignedToId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: tr('Assigned to', 'مسؤول عنه'), prefixIcon: const Icon(LucideIcons.userCheck, size: 18)),
                  items: [
                    DropdownMenuItem(value: null, child: Text(tr('Nobody yet', 'لسه محدش'))),
                    ..._assignableUsers.map((u) => DropdownMenuItem(value: u.id, child: Text(u.fullName))),
                  ],
                  onChanged: (v) => setState(() => _assignedToId = v),
                ),
                gap,
                if (canEditSource)
                  DropdownButtonFormField<String>(
                    initialValue: _sources.contains(_source) ? _source : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: tr('Source', 'المصدر'), prefixIcon: const Icon(LucideIcons.compass, size: 18)),
                    items: _sources.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                    onChanged: (v) => setState(() => _source = v),
                  )
                else
                  InputDecorator(
                    decoration: InputDecoration(
                      labelText: tr('Source (read-only)', 'المصدر (للعرض بس)'),
                      prefixIcon: const Icon(LucideIcons.compass, size: 18),
                      enabled: false,
                    ),
                    child: Text(_source?.isNotEmpty == true ? _source! : '—', style: TextStyle(color: p.subtext)),
                  ),
              ]),
              _Card(title: tr('Property', 'الوحدة'), children: [
                TextFormField(
                  controller: _projectController,
                  decoration: InputDecoration(labelText: tr('Project', 'المشروع'), prefixIcon: const Icon(LucideIcons.building2, size: 18)),
                ),
                gap,
                DropdownButtonFormField<String>(
                  initialValue: _propertyTypes.contains(_propertyType) ? _propertyType : null,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: tr('Property type', 'نوع الوحدة'), prefixIcon: const Icon(LucideIcons.house, size: 18)),
                  items: _propertyTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                  onChanged: (v) => setState(() => _propertyType = v),
                ),
                gap,
                Row(children: [
                  Expanded(
                    child: TextFormField(
                      controller: _budgetMinController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: tr('Min budget', 'أقل ميزانية')),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: TextFormField(
                      controller: _budgetMaxController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: tr('Max budget', 'أعلى ميزانية')),
                    ),
                  ),
                ]),
              ]),
              _Card(title: tr('Notes', 'ملاحظات'), children: [
                TextFormField(
                  controller: _notesController,
                  minLines: 3,
                  maxLines: 6,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(hintText: tr('Your note', 'ملاحظتك'), alignLabelWithHint: true),
                ),
                if (_parsedNotes.log.isNotEmpty) ...[gap, _CallLog(entries: _parsedNotes.log)],
              ]),
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.md, AppSpacing.page, AppSpacing.md),
          decoration: BoxDecoration(color: p.card, border: Border(top: BorderSide(color: p.border))),
          child: AppButton(tr('Save changes', 'حفظ التعديلات'), icon: LucideIcons.check, loading: _isSubmitting, expand: true, onPressed: _submit),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Card({required this.title, required this.children});

  @override
  Widget build(BuildContext context) => PremiumCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.md),
          ...children,
        ]),
      );
}


/// The calls the app recorded on this lead, one readable row each (newest first).
class _CallLog extends StatelessWidget {
  final List<NoteLogEntry> entries;
  const _CallLog({required this.entries});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withAlpha(150);
    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        initiallyExpanded: entries.length <= 3,
        leading: const Icon(LucideIcons.phoneCall, size: 18),
        title: Text(
          tr('Call log (${entries.length})', 'سجل المكالمات (${entries.length})'),
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
        subtitle: Text(
          tr('Recorded automatically, kept when you save', 'مسجّل تلقائياً ويتحفظ عند الحفظ'),
          style: TextStyle(fontSize: 11, color: muted),
        ),
        children: [
          for (final e in entries)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.colorScheme.onSurface.withAlpha(12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(e.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  if (e.time != null) Text(e.time!, style: TextStyle(fontSize: 11, color: muted)),
                  if (e.detail != null) ...[
                    const SizedBox(height: 4),
                    Text(e.detail!, style: const TextStyle(fontSize: 13, height: 1.35)),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(tr('Could not save the note, so the stage was not changed.', 'تعذّر حفظ الملاحظة، فلم تتغير المرحلة.'))),
          );
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
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Lead updated successfully'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSubmitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Lead')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Customer Full Name *',
                  prefixIcon: Icon(LucideIcons.user, size: 18),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number *',
                  prefixIcon: Icon(LucideIcons.phone, size: 18),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Phone is required' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  prefixIcon: Icon(LucideIcons.mail, size: 18),
                ),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _projectController,
                decoration: const InputDecoration(
                  labelText: 'Project / Compound',
                  prefixIcon: Icon(LucideIcons.building2, size: 18),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _propertyTypes.contains(_propertyType) ? _propertyType : null,
                decoration: const InputDecoration(
                  labelText: 'Property Type',
                  prefixIcon: Icon(LucideIcons.home, size: 18),
                ),
                items: _propertyTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                onChanged: (v) => setState(() => _propertyType = v),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _budgetMinController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Min Budget',
                        prefixIcon: Icon(LucideIcons.coins, size: 18),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _budgetMaxController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Max Budget',
                        prefixIcon: Icon(LucideIcons.coins, size: 18),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Builder(
                builder: (context) {
                  final profile = context.watch<AuthProvider>().profile;
                  final canEditSource = profile?.isAdmin == true || profile?.isTeamLeader == true;
                  if (!canEditSource) {
                    return InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Source (Read-only)',
                        prefixIcon: Icon(LucideIcons.compass, size: 18),
                        enabled: false,
                      ),
                      child: Text(
                        _source?.isNotEmpty == true ? _source! : '—',
                        style: TextStyle(color: Theme.of(context).disabledColor),
                      ),
                    );
                  }
                  return DropdownButtonFormField<String>(
                    initialValue: _sources.contains(_source) ? _source : null,
                    decoration: const InputDecoration(
                      labelText: 'Source',
                      prefixIcon: Icon(LucideIcons.compass, size: 18),
                    ),
                    items: _sources.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                    onChanged: (v) => setState(() => _source = v),
                  );
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: _assignedToId,
                decoration: const InputDecoration(
                  labelText: 'Assign to Agent',
                  prefixIcon: Icon(LucideIcons.userCheck, size: 18),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Unassigned')),
                  ..._assignableUsers.map(
                    (u) => DropdownMenuItem(value: u.id, child: Text(u.fullName)),
                  ),
                ],
                onChanged: (v) => setState(() => _assignedToId = v),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _notesController,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: tr('Note', 'ملاحظة'),
                  alignLabelWithHint: true,
                ),
              ),
              if (_parsedNotes.log.isNotEmpty) ...[
                const SizedBox(height: 14),
                _CallLog(entries: _parsedNotes.log),
              ],
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Save Changes'),
              ),
            ],
          ),
        ),
      ),
    );
  }
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

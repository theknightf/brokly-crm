import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/lead_model.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/leads_service.dart';
import '../../data/services/users_service.dart';

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

  late String _status;
  String? _source;
  String? _propertyType;
  late String _priority;
  String? _assignedToId;

  bool _isSubmitting = false;
  List<UserProfileModel> _assignableUsers = [];

  final List<String> _sources = [
    'Referral',
    'Walk-in',
    'Facebook Ads',
    'Cold Call',
    'Instagram',
    'WhatsApp',
    'Website',
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
    _notesController = TextEditingController(text: l.notes ?? '');

    _status = l.status;
    _source = l.source;
    _propertyType = l.propertyType;
    _priority = l.priority;
    _assignedToId = l.assignedTo;

    _loadAssignableUsers();
  }

  Future<void> _loadAssignableUsers() async {
    final users = await UsersService().getAssignableUsers();
    if (mounted) {
      setState(() => _assignableUsers = users);
    }
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
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _isSubmitting = true);

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
      'source': _source,
      'priority': _priority,
      'assigned_to': _assignedToId,
      'notes': _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
    };

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
              DropdownButtonFormField<String>(
                initialValue: _sources.contains(_source) ? _source : null,
                decoration: const InputDecoration(
                  labelText: 'Source',
                  prefixIcon: Icon(LucideIcons.compass, size: 18),
                ),
                items: _sources.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                onChanged: (v) => setState(() => _source = v),
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
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Notes',
                  alignLabelWithHint: true,
                ),
              ),
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

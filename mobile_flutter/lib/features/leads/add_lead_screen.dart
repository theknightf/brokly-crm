import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/lead_model.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/users_service.dart';
import '../../state/leads_provider.dart';

class AddLeadScreen extends StatefulWidget {
  const AddLeadScreen({super.key});

  @override
  State<AddLeadScreen> createState() => _AddLeadScreenState();
}

class _AddLeadScreenState extends State<AddLeadScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _projectController = TextEditingController();
  final _unitController = TextEditingController();
  final _locationController = TextEditingController();
  final _budgetMinController = TextEditingController();
  final _budgetMaxController = TextEditingController();
  final _notesController = TextEditingController();

  final String _status = 'Fresh Leads';
  String? _source = 'Referral';
  String? _propertyType = '2BHK Apartment';
  String _priority = 'Normal';
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

    final lead = LeadModel(
      id: '',
      name: _nameController.text.trim(),
      phone: _phoneController.text.trim(),
      email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
      propertyType: _propertyType,
      budgetMin: double.tryParse(_budgetMinController.text.trim()),
      budgetMax: double.tryParse(_budgetMaxController.text.trim()),
      source: _source,
      status: _status,
      project: _projectController.text.trim().isNotEmpty ? _projectController.text.trim() : null,
      unit: _unitController.text.trim().isNotEmpty ? _unitController.text.trim() : null,
      location: _locationController.text.trim().isNotEmpty ? _locationController.text.trim() : null,
      priority: _priority,
      assignedTo: _assignedToId,
      notes: _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
    );

    try {
      await context.read<LeadsProvider>().createLead(lead);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lead "${lead.name}" added successfully'),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Add New Lead'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildSectionHeader('CONTACT INFORMATION', isDark),
              const SizedBox(height: 12),

              // Name
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Customer Full Name *',
                  prefixIcon: Icon(LucideIcons.user, size: 18),
                ),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),
              const SizedBox(height: 14),

              // Phone
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number *',
                  hintText: '01012345678',
                  prefixIcon: Icon(LucideIcons.phone, size: 18),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Phone is required';
                  final clean = v.replaceAll(RegExp(r'\D'), '');
                  if (clean.length < 8) return 'Enter a valid phone number';
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Email
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  hintText: 'customer@email.com',
                  prefixIcon: Icon(LucideIcons.mail, size: 18),
                ),
              ),
              const SizedBox(height: 24),

              _buildSectionHeader('PROPERTY & REQUIREMENTS', isDark),
              const SizedBox(height: 12),

              // Project
              TextFormField(
                controller: _projectController,
                decoration: const InputDecoration(
                  labelText: 'Project / Compound',
                  prefixIcon: Icon(LucideIcons.building2, size: 18),
                ),
              ),
              const SizedBox(height: 14),

              // Property Type Dropdown
              DropdownButtonFormField<String>(
                initialValue: _propertyType,
                decoration: const InputDecoration(
                  labelText: 'Property Type',
                  prefixIcon: Icon(LucideIcons.home, size: 18),
                ),
                items: _propertyTypes.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                onChanged: (v) => setState(() => _propertyType = v),
              ),
              const SizedBox(height: 14),

              // Budget Min & Max
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _budgetMinController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Min Budget (EGP)',
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
                        labelText: 'Max Budget (EGP)',
                        prefixIcon: Icon(LucideIcons.coins, size: 18),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              _buildSectionHeader('PIPELINE & ASSIGNMENT', isDark),
              const SizedBox(height: 12),

              // Source Dropdown
              DropdownButtonFormField<String>(
                initialValue: _source,
                decoration: const InputDecoration(
                  labelText: 'Lead Source',
                  prefixIcon: Icon(LucideIcons.compass, size: 18),
                ),
                items: _sources.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                onChanged: (v) => setState(() => _source = v),
              ),
              const SizedBox(height: 14),

              // Priority
              DropdownButtonFormField<String>(
                initialValue: _priority,
                decoration: const InputDecoration(
                  labelText: 'Priority',
                  prefixIcon: Icon(LucideIcons.flag, size: 18),
                ),
                items: const [
                  DropdownMenuItem(value: 'Low', child: Text('Low')),
                  DropdownMenuItem(value: 'Normal', child: Text('Normal')),
                  DropdownMenuItem(value: 'High', child: Text('High')),
                  DropdownMenuItem(value: 'Urgent', child: Text('Urgent')),
                ],
                onChanged: (v) => setState(() => _priority = v ?? 'Normal'),
              ),
              const SizedBox(height: 14),

              // Assigned Agent Dropdown
              DropdownButtonFormField<String>(
                initialValue: _assignedToId,
                decoration: const InputDecoration(
                  labelText: 'Assign to Agent',
                  prefixIcon: Icon(LucideIcons.userCheck, size: 18),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Auto-Assign (Rotation)')),
                  ..._assignableUsers.map(
                    (u) => DropdownMenuItem(value: u.id, child: Text(u.fullName)),
                  ),
                ],
                onChanged: (v) => setState(() => _assignedToId = v),
              ),
              const SizedBox(height: 14),

              // Notes
              TextFormField(
                controller: _notesController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Initial Notes',
                  hintText: 'Customer preferences, requirements, follow-up timeline…',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 32),

              // Submit Button
              ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Create Lead'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, bool isDark) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
      ),
    );
  }
}

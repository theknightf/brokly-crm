import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/lead_model.dart';
import '../../data/models/user_profile_model.dart';
import '../../data/services/supabase_service.dart';
import '../../data/services/users_service.dart';
import '../../state/auth_provider.dart';
import '../../state/leads_provider.dart';

class AddLeadScreen extends StatefulWidget {
  const AddLeadScreen({super.key});

  @override
  State<AddLeadScreen> createState() => _AddLeadScreenState();
}

class _AddLeadScreenState extends State<AddLeadScreen> {
  final _formKey = GlobalKey<FormState>();
  final SupabaseClient _client = SupabaseService().client;

  // Text Controllers
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _secondaryPhoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _notesController = TextEditingController();
  final _newSourceController = TextEditingController();

  // Country code for Primary Phone
  String _countryCode = '+20';
  static const List<Map<String, String>> _countryCodes = [
    {'code': '+20', 'label': '🇪🇬 +20'},
    {'code': '+971', 'label': '🇦🇪 +971'},
    {'code': '+966', 'label': '🇸🇦 +966'},
    {'code': '+974', 'label': '🇶🇦 +974'},
  ];

  // REQUIRED: Lead Source (Default to Meta Ads / Facebook Ads, validated on submit)
  String? _selectedSource = 'Meta Ads';
  List<String> _sources = [
    'Meta Ads',
    'Google Ads',
    'TikTok',
    'Referral',
    'Cold Dial',
    'Walk-in',
    'Facebook Ads',
    'Instagram',
    'WhatsApp',
    'Website',
  ];
  bool _isAddingSource = false;

  // OPTIONAL: Property Requirements
  String? _selectedProject;
  List<String> _projectOptions = [
    'Palm Residence Luxury Suites',
    'Downtown Sky Villa - Emaar',
    'New Zayed SODIC Estates',
    'Marassi Marina Views',
    'Mountain View iCity',
  ];

  String? _selectedCategory; // Optional: Villa, Penthouse, Apartment, Commercial, Off-Plan
  String? _selectedBedrooms; // Optional: 1 BR, 2 BR, 3 BR, 4+ BR

  // Optional Budget Target (in Millions EGP)
  bool _budgetEnabled = false;
  double _budgetSliderMillions = 7.5;
  double? _budgetMinMillions;
  double? _budgetMaxMillions;
  String? _selectedBudgetChip; // '3-5', '5-10', '10+'

  // OPTIONAL: Pipeline & Attribution
  String _funnelStage = 'Fresh Leads'; // Fresh Leads, Cold Calls, Following Up, Meeting
  String? _assignedToId;
  String? _assignedToName;
  List<UserProfileModel> _assignableUsers = [];

  // OPTIONAL: Auto-Schedule First Touch
  String? _schedulePreset; // 'today', 'tomorrow', 'custom', or null (optional)
  DateTime? _customScheduleDate;

  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    // Load assignable users
    try {
      final users = await UsersService().getAssignableUsers();
      if (mounted) {
        setState(() => _assignableUsers = users);
      }
    } catch (_) {}

    // Load live projects from Supabase
    try {
      final projRes = await _client
          .from('projects')
          .select('name, developer_name')
          .order('name', ascending: true)
          .limit(50);
      final liveProjects = <String>[];
      for (final raw in (projRes as List<dynamic>)) {
        final row = raw as Map<String, dynamic>;
        final name = row['name']?.toString().trim() ?? '';
        final dev = row['developer_name']?.toString().trim() ?? '';
        if (name.isNotEmpty) {
          liveProjects.add(dev.isNotEmpty ? '$name - $dev' : name);
        }
      }
      if (liveProjects.isNotEmpty && mounted) {
        setState(() {
          _projectOptions = {...liveProjects, ..._projectOptions}.toList();
        });
      }
    } catch (_) {}

    // Load live lead_sources from Supabase
    try {
      final srcRes = await _client
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
          _sources = {..._sources, ...liveSources}.toList();
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
    _newSourceController.dispose();
    super.dispose();
  }

  String _buildFullPhone() {
    final raw = _phoneController.text.trim();
    if (raw.isEmpty) return '';
    if (raw.startsWith('+')) return raw;
    if (_countryCode == '+20' && raw.startsWith('0')) {
      return raw;
    }
    return '$_countryCode$raw';
  }

  Future<void> _createCustomSource() async {
    final name = _newSourceController.text.trim();
    if (name.length < 2) return;
    setState(() => _isAddingSource = true);
    try {
      await _client.from('lead_sources').insert({
        'name': name,
        'is_active': true,
      });
    } catch (_) {}
    if (mounted) {
      setState(() {
        if (!_sources.contains(name)) {
          _sources = [name, ..._sources];
        }
        _selectedSource = name;
        _newSourceController.clear();
        _isAddingSource = false;
      });
    }
  }

  void _selectBudgetChip(String chipKey) {
    setState(() {
      if (_selectedBudgetChip == chipKey) {
        // Toggle off (optional)
        _selectedBudgetChip = null;
        _budgetEnabled = false;
        _budgetMinMillions = null;
        _budgetMaxMillions = null;
        return;
      }
      _selectedBudgetChip = chipKey;
      _budgetEnabled = true;
      if (chipKey == '3-5') {
        _budgetMinMillions = 3.0;
        _budgetMaxMillions = 5.0;
        _budgetSliderMillions = 4.0;
      } else if (chipKey == '5-10') {
        _budgetMinMillions = 5.0;
        _budgetMaxMillions = 10.0;
        _budgetSliderMillions = 7.5;
      } else if (chipKey == '10+') {
        _budgetMinMillions = 10.0;
        _budgetMaxMillions = 25.0;
        _budgetSliderMillions = 15.0;
      }
    });
  }

  Future<void> _submit({bool launchWhatsAppAfter = false}) async {
    // Validate ONLY Phone Number & Lead Source
    final rawPhone = _phoneController.text.trim();
    final cleanDigits = rawPhone.replaceAll(RegExp(r'\D'), '');
    if (cleanDigits.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Primary Phone Number is required (min 8 digits) / رقم الهاتف مطلوب'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    if (_selectedSource == null || _selectedSource!.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Lead Source is required / مصدر العميل مطلوب'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final fullPhone = _buildFullPhone();
    final enteredName = _nameController.text.trim();
    // Name is optional; if omitted, provide a clean fallback display label
    final resolvedName = enteredName.isNotEmpty ? enteredName : 'Lead $fullPhone';

    // Combine property category + bedrooms if selected
    String? propertyType;
    if (_selectedCategory != null && _selectedBedrooms != null) {
      propertyType = '$_selectedBedrooms $_selectedCategory';
    } else if (_selectedCategory != null) {
      propertyType = _selectedCategory;
    } else if (_selectedBedrooms != null) {
      propertyType = '$_selectedBedrooms Apartment';
    }

    // Budget calculation (optional)
    double? budgetMin;
    double? budgetMax;
    if (_budgetEnabled) {
      if (_budgetMinMillions != null && _budgetMaxMillions != null) {
        budgetMin = _budgetMinMillions! * 1000000;
        budgetMax = _budgetMaxMillions! * 1000000;
      } else {
        budgetMin = (_budgetSliderMillions * 0.85) * 1000000;
        budgetMax = _budgetSliderMillions * 1000000;
      }
    }

    // Follow-up date calculation (optional)
    String? followUpDue;
    final now = DateTime.now();
    if (_schedulePreset == 'today') {
      followUpDue = DateFormat('yyyy-MM-dd').format(now);
    } else if (_schedulePreset == 'tomorrow') {
      followUpDue = DateFormat('yyyy-MM-dd').format(now.add(const Duration(days: 1)));
    } else if (_schedulePreset == 'custom' && _customScheduleDate != null) {
      followUpDue = DateFormat('yyyy-MM-dd').format(_customScheduleDate!);
    }

    // Append secondary phone to notes if provided
    final notesParts = <String>[];
    if (_secondaryPhoneController.text.trim().isNotEmpty) {
      notesParts.add('Secondary Phone: ${_secondaryPhoneController.text.trim()}');
    }
    if (_notesController.text.trim().isNotEmpty) {
      notesParts.add(_notesController.text.trim());
    }
    final combinedNotes = notesParts.isEmpty ? null : notesParts.join('\n');

    final lead = LeadModel(
      id: '',
      name: resolvedName,
      phone: fullPhone,
      email: _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null,
      propertyType: propertyType,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      source: _selectedSource!,
      status: _funnelStage,
      project: _selectedProject,
      unit: _selectedBedrooms,
      assignedTo: _assignedToId,
      followUpDue: followUpDue,
      notes: combinedNotes,
    );

    try {
      await context.read<LeadsProvider>().createLead(lead);
      if (mounted) {
        if (launchWhatsAppAfter) {
          await WhatsAppUtils.openWhatsAppChat(context, phone: fullPhone);
        }
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Lead "$resolvedName" created successfully'),
              backgroundColor: const Color(0xFF65A30D),
            ),
          );
        }
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

  void _showAssignAgentPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF191C22),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              const Text(
                'Assign Account Executive',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFF272A31),
                  child: Icon(LucideIcons.refreshCw, size: 16, color: Color(0xFFCCFF80)),
                ),
                title: const Text(
                  'Auto-Assign / Current Executive',
                  style: TextStyle(color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w600),
                ),
                onTap: () {
                  setState(() {
                    _assignedToId = null;
                    _assignedToName = null;
                  });
                  Navigator.pop(ctx);
                },
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: _assignableUsers.length,
                  itemBuilder: (_, i) {
                    final u = _assignableUsers[i];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFFCCFF80).withAlpha(35),
                        child: Text(
                          u.initials,
                          style: const TextStyle(
                            color: Color(0xFFCCFF80),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      title: Text(
                        u.fullName,
                        style: const TextStyle(color: Colors.white, fontSize: 13.5),
                      ),
                      subtitle: Text(
                        u.role,
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                      ),
                      onTap: () {
                        setState(() {
                          _assignedToId = u.id;
                          _assignedToName = u.fullName;
                        });
                        Navigator.pop(ctx);
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
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final currentBrokerName = _assignedToName ??
        (auth.profile?.fullName.trim().isNotEmpty == true
            ? auth.profile!.fullName
            : 'Farooq Mansoor');
    final currentBrokerInitials = currentBrokerName
        .trim()
        .split(' ')
        .take(2)
        .map((s) => s.isNotEmpty ? s[0].toUpperCase() : '')
        .join();

    // Stitch Design System Colors
    const bgLowest = Color(0xFF0B0E14);
    const surface = Color(0xFF10131A);
    const cardLow = Color(0xFF191C22);
    const surfaceHigh = Color(0xFF272A31);
    const neonPrimary = Color(0xFFCCFF80);
    const neonContainer = Color(0xFFA3E635);
    const outlineVariant = Color(0xFF424936);
    const onSurface = Color(0xFFE1E2EB);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    return Scaffold(
      backgroundColor: surface,
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              // 1. Stitch Transactional Header Bar
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: bgLowest.withAlpha(235),
                  border: Border(
                    bottom: BorderSide(color: outlineVariant.withAlpha(100)),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        InkWell(
                          onTap: () => Navigator.pop(context),
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: cardLow,
                              shape: BoxShape.circle,
                              border: Border.all(color: outlineVariant.withAlpha(150)),
                            ),
                            child: const Icon(LucideIcons.x, size: 18, color: onSurfaceVariant),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Text(
                                  'Add New Lead',
                                  style: TextStyle(
                                    color: onSurface,
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(
                                    color: neonPrimary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ],
                            ),
                            const Text(
                              'إضافة عميل جديد',
                              style: TextStyle(
                                color: onSurfaceVariant,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: bgLowest,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: outlineVariant.withAlpha(150)),
                          ),
                          child: const Center(
                            child: Text(
                              'B',
                              style: TextStyle(
                                color: neonPrimary,
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        InkWell(
                          onTap: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Enter Phone & Source below — all other fields are optional'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: surfaceHigh,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: neonPrimary.withAlpha(90)),
                            ),
                            child: const Row(
                              children: [
                                Icon(LucideIcons.scanLine, size: 13, color: neonPrimary),
                                SizedBox(width: 5),
                                Text(
                                  'SCAN CARD',
                                  style: TextStyle(
                                    color: neonPrimary,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // 2. Main Scrollable Form Canvas
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(14, 16, 14, 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // SECTION 1: Contact Information (بيانات العميل)
                      _buildSectionCard(
                        icon: LucideIcons.user,
                        title: 'Contact Information',
                        subtitleAr: 'بيانات العميل',
                        badgeText: 'ESSENTIAL',
                        isBadgePrimary: true,
                        children: [
                          // Client Full Name (Optional)
                          _buildFieldLabel(
                            label: 'Client Full Name',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'الاسم بالكامل',
                          ),
                          const SizedBox(height: 6),
                          _buildDarkTextField(
                            controller: _nameController,
                            hintText: 'e.g. Farooq Mansoor / فاروق منصور',
                            prefixIcon: LucideIcons.idCard,
                          ),
                          const SizedBox(height: 14),

                          // Primary Phone (REQUIRED *)
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  const Text(
                                    'Primary Phone ',
                                    style: TextStyle(
                                      color: onSurface,
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const Text(
                                    '*',
                                    style: TextStyle(
                                      color: neonPrimary,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: neonPrimary.withAlpha(25),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: neonPrimary.withAlpha(80)),
                                    ),
                                    child: const Row(
                                      children: [
                                        Icon(LucideIcons.checkCircle2, size: 10, color: neonPrimary),
                                        SizedBox(width: 3),
                                        Text(
                                          'WhatsApp',
                                          style: TextStyle(
                                            color: neonPrimary,
                                            fontSize: 9.5,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const Text(
                                'رقم الهاتف الأساسي *',
                                style: TextStyle(color: onSurfaceVariant, fontSize: 11),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Container(
                                height: 46,
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                decoration: BoxDecoration(
                                  color: bgLowest,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: outlineVariant.withAlpha(130)),
                                ),
                                child: DropdownButtonHideUnderline(
                                  child: DropdownButton<String>(
                                    value: _countryCode,
                                    dropdownColor: cardLow,
                                    style: const TextStyle(
                                      color: onSurface,
                                      fontSize: 13,
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.w600,
                                    ),
                                    items: _countryCodes
                                        .map(
                                          (c) => DropdownMenuItem(
                                            value: c['code'],
                                            child: Text(c['label']!),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (v) {
                                      if (v != null) setState(() => _countryCode = v);
                                    },
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _buildDarkTextField(
                                  controller: _phoneController,
                                  hintText: '102 345 6789',
                                  keyboardType: TextInputType.phone,
                                  suffixWidget: IconButton(
                                    icon: const Icon(
                                      LucideIcons.messageSquare,
                                      size: 16,
                                      color: neonPrimary,
                                    ),
                                    tooltip: 'Verify on WhatsApp',
                                    onPressed: () {
                                      final phone = _buildFullPhone();
                                      if (phone.isNotEmpty) {
                                        WhatsAppUtils.openWhatsAppChat(context, phone: phone);
                                      }
                                    },
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Secondary Phone (Optional)
                          _buildFieldLabel(
                            label: 'Secondary Phone',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'رقم هاتف بديل',
                          ),
                          const SizedBox(height: 6),
                          _buildDarkTextField(
                            controller: _secondaryPhoneController,
                            hintText: '+20 111 987 6543',
                            keyboardType: TextInputType.phone,
                            prefixIcon: LucideIcons.smartphone,
                          ),
                          const SizedBox(height: 14),

                          // Email Address (Optional)
                          _buildFieldLabel(
                            label: 'Email Address',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'البريد الإلكتروني',
                          ),
                          const SizedBox(height: 6),
                          _buildDarkTextField(
                            controller: _emailController,
                            hintText: 'f.mansoor@portfolio.ae',
                            keyboardType: TextInputType.emailAddress,
                            prefixIcon: LucideIcons.atSign,
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // SECTION 2: Property Requirements (اهتمامات العقار والميزانية — Optional)
                      _buildSectionCard(
                        icon: LucideIcons.building2,
                        title: 'Property Requirements',
                        subtitleAr: 'اهتمامات العقار والميزانية',
                        badgeText: 'OPTIONAL',
                        isBadgePrimary: false,
                        children: [
                          // Project / Developer (Optional)
                          _buildFieldLabel(
                            label: 'Project / Developer',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'المشروع / المطور',
                          ),
                          const SizedBox(height: 6),
                          Container(
                            height: 46,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              color: bgLowest,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: outlineVariant.withAlpha(130)),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String?>(
                                value: _selectedProject,
                                isExpanded: true,
                                dropdownColor: cardLow,
                                hint: Text(
                                  '— Select Project / Developer (Optional) —',
                                  style: TextStyle(
                                    color: onSurfaceVariant.withAlpha(140),
                                    fontSize: 13,
                                  ),
                                ),
                                style: const TextStyle(color: onSurface, fontSize: 13.5),
                                items: [
                                  const DropdownMenuItem<String?>(
                                    value: null,
                                    child: Text('None (Optional)'),
                                  ),
                                  ..._projectOptions.map(
                                    (p) => DropdownMenuItem<String?>(
                                      value: p,
                                      child: Text(p, overflow: TextOverflow.ellipsis),
                                    ),
                                  ),
                                ],
                                onChanged: (v) => setState(() => _selectedProject = v),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),

                          // Property Category Chips (Optional)
                          _buildFieldLabel(
                            label: 'Property Category',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'نوع العقار',
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              _buildCategoryChip('Villa', LucideIcons.home),
                              _buildCategoryChip('Penthouse', LucideIcons.building),
                              _buildCategoryChip('Apartment', LucideIcons.building2),
                              _buildCategoryChip('Commercial', LucideIcons.store),
                              _buildCategoryChip('Off-Plan', LucideIcons.hardHat),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Allocated Budget Target Box (Optional)
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: bgLowest,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: outlineVariant.withAlpha(110)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text(
                                      'ALLOCATED BUDGET TARGET (OPTIONAL)',
                                      style: TextStyle(
                                        color: onSurfaceVariant,
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.6,
                                      ),
                                    ),
                                    Row(
                                      children: [
                                        if (_budgetEnabled)
                                          GestureDetector(
                                            onTap: () => setState(() {
                                              _budgetEnabled = false;
                                              _selectedBudgetChip = null;
                                              _budgetMinMillions = null;
                                              _budgetMaxMillions = null;
                                            }),
                                            child: const Padding(
                                              padding: EdgeInsets.only(right: 8),
                                              child: Text(
                                                'Clear',
                                                style: TextStyle(
                                                  color: Color(0xFFEF4444),
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                            ),
                                          ),
                                        const Text(
                                          'AED / EGP',
                                          style: TextStyle(
                                            color: neonPrimary,
                                            fontSize: 11,
                                            fontFamily: 'monospace',
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.baseline,
                                  textBaseline: TextBaseline.alphabetic,
                                  children: [
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.baseline,
                                      textBaseline: TextBaseline.alphabetic,
                                      children: [
                                        Text(
                                          _budgetEnabled
                                              ? '${_budgetSliderMillions.toStringAsFixed(1)}M'
                                              : 'Any Budget',
                                          style: TextStyle(
                                            color: _budgetEnabled ? neonPrimary : onSurfaceVariant,
                                            fontSize: _budgetEnabled ? 26 : 18,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        if (_budgetEnabled) ...[
                                          const SizedBox(width: 4),
                                          const Text(
                                            'EGP',
                                            style: TextStyle(
                                              color: onSurfaceVariant,
                                              fontSize: 13,
                                              fontFamily: 'monospace',
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                    Text(
                                      _budgetEnabled
                                          ? 'Range: ${(_budgetMinMillions ?? (_budgetSliderMillions * 0.8)).toStringAsFixed(1)}M – ${(_budgetMaxMillions ?? _budgetSliderMillions).toStringAsFixed(1)}M'
                                          : 'Optional — Slide or tap below',
                                      style: const TextStyle(
                                        color: onSurfaceVariant,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                                SliderTheme(
                                  data: SliderTheme.of(context).copyWith(
                                    activeTrackColor: neonPrimary,
                                    inactiveTrackColor: surfaceHigh,
                                    thumbColor: neonPrimary,
                                    overlayColor: neonPrimary.withAlpha(30),
                                    trackHeight: 4,
                                  ),
                                  child: Slider(
                                    value: _budgetSliderMillions,
                                    min: 1.0,
                                    max: 25.0,
                                    divisions: 48,
                                    onChanged: (val) {
                                      setState(() {
                                        _budgetEnabled = true;
                                        _budgetSliderMillions = val;
                                        _selectedBudgetChip = null;
                                        _budgetMinMillions = null;
                                        _budgetMaxMillions = null;
                                      });
                                    },
                                  ),
                                ),
                                Row(
                                  children: [
                                    Expanded(child: _buildBudgetQuickChip('3-5', '3M - 5M')),
                                    const SizedBox(width: 6),
                                    Expanded(child: _buildBudgetQuickChip('5-10', '5M - 10M')),
                                    const SizedBox(width: 6),
                                    Expanded(child: _buildBudgetQuickChip('10+', '10M+ Ultra')),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),

                          // Bedrooms & Layout (Optional)
                          _buildFieldLabel(
                            label: 'Bedrooms & Layout',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'عدد الغرف',
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: ['1 BR', '2 BR', '3 BR', '4+ BR'].map((br) {
                              final selected = _selectedBedrooms == br;
                              return Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(right: br == '4+ BR' ? 0 : 6),
                                  child: InkWell(
                                    onTap: () => setState(() {
                                      _selectedBedrooms = selected ? null : br;
                                    }),
                                    borderRadius: BorderRadius.circular(12),
                                    child: Container(
                                      height: 38,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: selected ? neonPrimary.withAlpha(25) : bgLowest,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: selected
                                              ? neonPrimary
                                              : outlineVariant.withAlpha(130),
                                        ),
                                      ),
                                      child: Text(
                                        br,
                                        style: TextStyle(
                                          color: selected ? neonPrimary : onSurfaceVariant,
                                          fontSize: 12,
                                          fontWeight:
                                              selected ? FontWeight.w800 : FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // SECTION 3: Pipeline & Attribution (المصدر والمسار البيعي)
                      _buildSectionCard(
                        icon: LucideIcons.gitBranch,
                        title: 'Pipeline & Attribution',
                        subtitleAr: 'المصدر والمسار البيعي',
                        badgeText: 'Step 3 of 4',
                        isBadgePrimary: false,
                        children: [
                          // Initial Funnel Stage
                          _buildFieldLabel(
                            label: 'Initial Funnel Stage',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'المرحلة المبدئية',
                          ),
                          const SizedBox(height: 8),
                          GridView.count(
                            crossAxisCount: 2,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                            childAspectRatio: 2.6,
                            children: [
                              _buildStageTile(
                                key: 'Fresh Leads',
                                title: 'Fresh Lead',
                                subtitleAr: 'عميل جديد فوري',
                              ),
                              _buildStageTile(
                                key: 'Cold Calls',
                                title: 'Cold Outreach',
                                subtitleAr: 'تواصل بارد',
                              ),
                              _buildStageTile(
                                key: 'Following Up',
                                title: 'Follow-up Queue',
                                subtitleAr: 'قائمة المتابعة',
                              ),
                              _buildStageTile(
                                key: 'Meeting',
                                title: 'Meeting Scheduled',
                                subtitleAr: 'تحديد موعد جلسة',
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          // Lead Source (REQUIRED *)
                          _buildFieldLabel(
                            label: 'Lead Source',
                            isRequired: true,
                            labelAr: 'مصدر العميل الإعلاني *',
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: _sources.map((src) {
                              final selected = _selectedSource == src;
                              return InkWell(
                                onTap: () => setState(() => _selectedSource = src),
                                borderRadius: BorderRadius.circular(20),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 11,
                                    vertical: 7,
                                  ),
                                  decoration: BoxDecoration(
                                    color: selected ? neonPrimary.withAlpha(25) : bgLowest,
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: selected
                                          ? neonPrimary
                                          : outlineVariant.withAlpha(110),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        _iconForSource(src),
                                        size: 13,
                                        color: selected ? neonPrimary : onSurfaceVariant,
                                      ),
                                      const SizedBox(width: 5),
                                      Text(
                                        src,
                                        style: TextStyle(
                                          color: selected ? neonPrimary : onSurfaceVariant,
                                          fontSize: 11.5,
                                          fontWeight:
                                              selected ? FontWeight.w800 : FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 10),
                          // Quick add custom source row
                          Row(
                            children: [
                              Expanded(
                                child: SizedBox(
                                  height: 38,
                                  child: _buildDarkTextField(
                                    controller: _newSourceController,
                                    hintText: 'Add custom source...',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                height: 38,
                                child: ElevatedButton.icon(
                                  onPressed: _isAddingSource ? null : _createCustomSource,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: surfaceHigh,
                                    foregroundColor: neonPrimary,
                                    padding: const EdgeInsets.symmetric(horizontal: 12),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(10),
                                      side: BorderSide(color: neonPrimary.withAlpha(90)),
                                    ),
                                  ),
                                  icon: const Icon(LucideIcons.plus, size: 14),
                                  label: const Text(
                                    'Add Source',
                                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          // Assign Account Executive (Optional)
                          _buildFieldLabel(
                            label: 'Assign Account Executive',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'تعيين مسؤول المبيعات',
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: bgLowest,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: outlineVariant.withAlpha(130)),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 36,
                                      height: 36,
                                      decoration: BoxDecoration(
                                        color: neonPrimary.withAlpha(35),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: neonPrimary.withAlpha(120)),
                                      ),
                                      child: Center(
                                        child: Text(
                                          currentBrokerInitials.isNotEmpty
                                              ? currentBrokerInitials
                                              : 'FM',
                                          style: const TextStyle(
                                            color: neonPrimary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Text(
                                              currentBrokerName,
                                              style: const TextStyle(
                                                color: onSurface,
                                                fontSize: 13.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                            const SizedBox(width: 4),
                                            const Icon(
                                              LucideIcons.badgeCheck,
                                              size: 14,
                                              color: neonPrimary,
                                            ),
                                          ],
                                        ),
                                        Text(
                                          _assignedToId == null
                                              ? 'Senior Broker Director • Default'
                                              : 'Assigned Account Executive',
                                          style: const TextStyle(
                                            color: onSurfaceVariant,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                InkWell(
                                  onTap: _showAssignAgentPicker,
                                  borderRadius: BorderRadius.circular(8),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: surfaceHigh,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: outlineVariant.withAlpha(110)),
                                    ),
                                    child: const Text(
                                      'Change',
                                      style: TextStyle(
                                        color: neonPrimary,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // SECTION 4: Initial Engagement (الملاحظات وتحديد الموعد — Optional)
                      _buildSectionCard(
                        icon: LucideIcons.clock,
                        title: 'Initial Engagement',
                        subtitleAr: 'الملاحظات وتحديد الموعد',
                        badgeText: 'OPTIONAL',
                        isBadgePrimary: false,
                        children: [
                          _buildFieldLabel(
                            label: 'Auto-Schedule First Touch',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'تحديد الموعد الأول',
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: _buildScheduleChip(
                                  key: 'today',
                                  title: 'Today',
                                  subtitle: '16:30 PM',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _buildScheduleChip(
                                  key: 'tomorrow',
                                  title: 'Tomorrow',
                                  subtitle: '11:00 AM',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _buildScheduleChip(
                                  key: 'custom',
                                  title: 'Custom',
                                  subtitle: _customScheduleDate != null
                                      ? DateFormat('dd/MM').format(_customScheduleDate!)
                                      : 'Calendar',
                                  onCustomTap: () async {
                                    final now = DateTime.now();
                                    final picked = await showDatePicker(
                                      context: context,
                                      initialDate:
                                          _customScheduleDate ?? now.add(const Duration(days: 2)),
                                      firstDate: now,
                                      lastDate: now.add(const Duration(days: 365)),
                                    );
                                    if (picked != null) {
                                      setState(() {
                                        _customScheduleDate = picked;
                                        _schedulePreset = 'custom';
                                      });
                                    }
                                  },
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Initial Intake Notes & Demands (Optional)
                          _buildFieldLabel(
                            label: 'Initial Intake Notes & Demands',
                            isRequired: false,
                            optionalTag: '(Optional)',
                            labelAr: 'ملاحظات العميل الأولية',
                          ),
                          const SizedBox(height: 6),
                          _buildDarkTextField(
                            controller: _notesController,
                            maxLines: 3,
                            hintText:
                                'Looking for 3BR with 7-year flexible payment plan, down payment ready, prefers sea-view balcony...',
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              // 3. Sticky Bottom Action Bar (Fintech CRM Kinetic Dock)
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                decoration: BoxDecoration(
                  color: bgLowest.withAlpha(245),
                  border: Border(
                    top: BorderSide(color: outlineVariant.withAlpha(150)),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(180),
                      blurRadius: 24,
                      offset: const Offset(0, -6),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        // Secondary Ghost Button: Save as Draft
                        InkWell(
                          onTap: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Draft saved locally / تم حفظ المسودة'),
                                duration: Duration(seconds: 2),
                              ),
                            );
                          },
                          borderRadius: BorderRadius.circular(24),
                          child: Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: cardLow,
                              shape: BoxShape.circle,
                              border: Border.all(color: outlineVariant.withAlpha(180)),
                            ),
                            child: const Icon(
                              LucideIcons.bookmarkPlus,
                              size: 20,
                              color: onSurfaceVariant,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),

                        // Primary High-Contrast Kinetic Glowing Neon Button
                        Expanded(
                          child: SizedBox(
                            height: 48,
                            child: ElevatedButton(
                              onPressed: _isSubmitting ? null : () => _submit(),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: neonContainer,
                                foregroundColor: bgLowest,
                                elevation: 6,
                                shadowColor: neonContainer.withAlpha(120),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(28),
                                ),
                              ),
                              child: _isSubmitting
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.2,
                                        color: bgLowest,
                                      ),
                                    )
                                  : const Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Text(
                                          'Create Lead & Start Outreach',
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w800,
                                            color: bgLowest,
                                          ),
                                        ),
                                        SizedBox(width: 6),
                                        Text(
                                          '→',
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w900,
                                            color: bgLowest,
                                          ),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),

                        // WhatsApp Instant Blast Action
                        InkWell(
                          onTap: _isSubmitting
                              ? null
                              : () => _submit(launchWhatsAppAfter: true),
                          borderRadius: BorderRadius.circular(24),
                          child: Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: const Color(0xFF161B22),
                              shape: BoxShape.circle,
                              border: Border.all(color: neonPrimary.withAlpha(90)),
                            ),
                            child: const Icon(
                              LucideIcons.send,
                              size: 19,
                              color: neonPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Only Phone & Source required • All else optional',
                          style: TextStyle(
                            color: onSurfaceVariant.withAlpha(150),
                            fontSize: 10,
                          ),
                        ),
                        Text(
                          'حفظ تلقائي للمعلومات وتحديث المسار',
                          style: TextStyle(
                            color: onSurfaceVariant.withAlpha(150),
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required IconData icon,
    required String title,
    required String subtitleAr,
    required String badgeText,
    required bool isBadgePrimary,
    required List<Widget> children,
  }) {
    const cardLow = Color(0xFF191C22);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurface = Color(0xFFE1E2EB);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cardLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: outlineVariant.withAlpha(110)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.only(bottom: 10),
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: outlineVariant.withAlpha(80)),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: neonPrimary.withAlpha(25),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: neonPrimary.withAlpha(60)),
                      ),
                      child: Icon(icon, size: 16, color: neonPrimary),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: onSurface,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          subtitleAr,
                          style: const TextStyle(
                            color: onSurfaceVariant,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isBadgePrimary
                        ? neonPrimary.withAlpha(25)
                        : Colors.white.withAlpha(10),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isBadgePrimary
                          ? neonPrimary.withAlpha(70)
                          : outlineVariant.withAlpha(90),
                    ),
                  ),
                  child: Text(
                    badgeText,
                    style: TextStyle(
                      color: isBadgePrimary ? neonPrimary : onSurfaceVariant,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          ...children,
        ],
      ),
    );
  }

  Widget _buildFieldLabel({
    required String label,
    required bool isRequired,
    String? optionalTag,
    required String labelAr,
  }) {
    const neonPrimary = Color(0xFFCCFF80);
    const onSurface = Color(0xFFE1E2EB);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Text(
              label,
              style: const TextStyle(
                color: onSurface,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (isRequired)
              const Text(
                ' *',
                style: TextStyle(
                  color: neonPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            if (optionalTag != null) ...[
              const SizedBox(width: 5),
              Text(
                optionalTag,
                style: TextStyle(
                  color: onSurfaceVariant.withAlpha(160),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
        Text(
          labelAr,
          style: const TextStyle(
            color: onSurfaceVariant,
            fontSize: 11,
          ),
        ),
      ],
    );
  }

  Widget _buildDarkTextField({
    required TextEditingController controller,
    required String hintText,
    IconData? prefixIcon,
    Widget? suffixWidget,
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    const bgLowest = Color(0xFF0B0E14);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurface = Color(0xFFE1E2EB);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      style: const TextStyle(color: onSurface, fontSize: 13.5),
      decoration: InputDecoration(
        filled: true,
        fillColor: bgLowest,
        hintText: hintText,
        hintStyle: TextStyle(color: onSurfaceVariant.withAlpha(120), fontSize: 13),
        prefixIcon: prefixIcon != null
            ? Icon(prefixIcon, size: 17, color: onSurfaceVariant)
            : null,
        suffixIcon: suffixWidget,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: outlineVariant.withAlpha(130)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: neonPrimary, width: 1.4),
        ),
      ),
    );
  }

  Widget _buildCategoryChip(String label, IconData icon) {
    const bgLowest = Color(0xFF0B0E14);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    final selected = _selectedCategory == label;
    return InkWell(
      onTap: () => setState(() {
        _selectedCategory = selected ? null : label;
      }),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? neonPrimary.withAlpha(25) : bgLowest,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? neonPrimary : outlineVariant.withAlpha(130),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: selected ? neonPrimary : onSurfaceVariant),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                color: selected ? neonPrimary : onSurfaceVariant,
                fontSize: 12,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBudgetQuickChip(String key, String label) {
    const cardSurface = Color(0xFF1D2026);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    final selected = _selectedBudgetChip == key;
    return InkWell(
      onTap: () => _selectBudgetChip(key),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 7),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? neonPrimary.withAlpha(25) : cardSurface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? neonPrimary : outlineVariant.withAlpha(110),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? neonPrimary : onSurfaceVariant,
            fontSize: 11.5,
            fontFamily: 'monospace',
            fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
          ),
        ),
      ),
    );
  }

  Widget _buildStageTile({
    required String key,
    required String title,
    required String subtitleAr,
  }) {
    const bgLowest = Color(0xFF0B0E14);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurface = Color(0xFFE1E2EB);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    final selected = _funnelStage == key;
    return InkWell(
      onTap: () => setState(() => _funnelStage = key),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? neonPrimary.withAlpha(25) : bgLowest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? neonPrimary : outlineVariant.withAlpha(110),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: selected ? neonPrimary : onSurfaceVariant.withAlpha(100),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? neonPrimary : onSurface,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    subtitleAr,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: selected ? neonPrimary.withAlpha(200) : onSurfaceVariant,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScheduleChip({
    required String key,
    required String title,
    required String subtitle,
    VoidCallback? onCustomTap,
  }) {
    const bgLowest = Color(0xFF0B0E14);
    const neonPrimary = Color(0xFFCCFF80);
    const outlineVariant = Color(0xFF424936);
    const onSurfaceVariant = Color(0xFFC2CAB0);

    final selected = _schedulePreset == key;
    return InkWell(
      onTap: () {
        if (onCustomTap != null) {
          onCustomTap();
        } else {
          setState(() {
            _schedulePreset = selected ? null : key;
          });
        }
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
        decoration: BoxDecoration(
          color: selected ? neonPrimary.withAlpha(25) : bgLowest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? neonPrimary : outlineVariant.withAlpha(110),
          ),
        ),
        child: Column(
          children: [
            Text(
              title,
              style: TextStyle(
                color: selected ? neonPrimary : onSurfaceVariant,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                color: selected
                    ? neonPrimary.withAlpha(190)
                    : onSurfaceVariant.withAlpha(160),
                fontSize: 10,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconForSource(String src) {
    final s = src.toLowerCase();
    if (s.contains('meta') || s.contains('facebook')) return LucideIcons.megaphone;
    if (s.contains('google') || s.contains('web')) return LucideIcons.globe;
    if (s.contains('tiktok') || s.contains('insta')) return LucideIcons.video;
    if (s.contains('referral')) return LucideIcons.handshake;
    if (s.contains('cold') || s.contains('call')) return LucideIcons.phoneCall;
    if (s.contains('walk')) return LucideIcons.footprints;
    if (s.contains('whatsapp')) return LucideIcons.messageCircle;
    return LucideIcons.compass;
  }
}

/// Canonical Lead Model matching the Brokly CRM TypeScript schema & Supabase DB table
class LeadModel {
  final String id;
  final String name;
  final String phone;
  final String? email;
  final String? propertyType;
  final double? budgetMin;
  final double? budgetMax;
  final String? source;
  final String? agent;
  final String? agentInitials;
  final String status;
  final String? assignedTo;
  final String? assignedToName;
  final String? referredTo;
  final String? referredToName;
  final String? referredBy;
  final String? referredByName;
  final String? adminId;
  final String? adminName;
  final String? lastContact;
  final String? followUpDue;
  final String? lastActionAt;
  final String? lastActionBy;
  final bool actionTakenToday;
  final bool hasBeenCalled;
  final String? lastCallAt;
  final String? createdAt;
  final String? notes;
  final String? location;
  final String? developer;
  final String? project;
  final String? unit;
  final String? interestLevel;
  final String? leadRating;
  final String priority;
  final String? team;
  final String? csAgent;
  final String? unitId;
  final double unitArea;
  final double unitPrice;
  final double totalPrice;
  final double downPayment;
  final double downPaymentPct;
  final double installmentAmount;
  final int installmentCount;
  final int installmentFrequency;
  final String? paymentStartDate;
  final double reservationAmount;
  final double maintenanceFees;
  final double remainingAmount;
  final String paymentStatus;
  final String? reservationDate;
  final String? closingDate;
  final double finalPrice;
  final double commission;

  LeadModel({
    required this.id,
    this.name = '',
    required this.phone,
    this.email,
    this.propertyType,
    this.budgetMin,
    this.budgetMax,
    this.source,
    this.agent,
    this.agentInitials,
    this.status = 'Fresh Leads',
    this.assignedTo,
    this.assignedToName,
    this.referredTo,
    this.referredToName,
    this.referredBy,
    this.referredByName,
    this.adminId,
    this.adminName,
    this.lastContact,
    this.followUpDue,
    this.lastActionAt,
    this.lastActionBy,
    this.actionTakenToday = false,
    this.hasBeenCalled = false,
    this.lastCallAt,
    this.createdAt,
    this.notes,
    this.location,
    this.developer,
    this.project,
    this.unit,
    this.interestLevel,
    this.leadRating,
    this.priority = 'Normal',
    this.team,
    this.csAgent,
    this.unitId,
    this.unitArea = 0.0,
    this.unitPrice = 0.0,
    this.totalPrice = 0.0,
    this.downPayment = 0.0,
    this.downPaymentPct = 0.0,
    this.installmentAmount = 0.0,
    this.installmentCount = 0,
    this.installmentFrequency = 12,
    this.paymentStartDate,
    this.reservationAmount = 0.0,
    this.maintenanceFees = 0.0,
    this.remainingAmount = 0.0,
    this.paymentStatus = 'Not Started',
    this.reservationDate,
    this.closingDate,
    this.finalPrice = 0.0,
    this.commission = 0.0,
  });

  DateTime? get followUpDateTime => followUpDue != null ? DateTime.tryParse(followUpDue!) : null;

  /// Parse from Supabase table row matching rowToLead in crmService.ts
  factory LeadModel.fromJson(Map<String, dynamic> json) {
    final lastAction = json['last_action_at'] as String?;
    bool isActionToday = false;
    if (lastAction != null) {
      try {
        final d = DateTime.parse(lastAction).toLocal();
        final now = DateTime.now();
        isActionToday = d.year == now.year && d.month == now.month && d.day == now.day;
      } catch (_) {}
    }

    String? assignedName;
    if (json['assigned_to_profile'] is Map) {
      assignedName = json['assigned_to_profile']['full_name'] as String?;
    }

    return LeadModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      email: json['email']?.toString(),
      propertyType: json['property_type']?.toString(),
      budgetMin: json['budget_min'] != null ? (json['budget_min'] as num).toDouble() : null,
      budgetMax: json['budget_max'] != null ? (json['budget_max'] as num).toDouble() : null,
      source: json['source']?.toString(),
      agent: json['agent']?.toString(),
      agentInitials: json['agent_initials']?.toString(),
      status: json['crm_status']?.toString() ?? json['lead_status']?.toString() ?? 'Fresh Leads',
      assignedTo: json['assigned_to']?.toString(),
      assignedToName: assignedName,
      referredTo: json['referred_to']?.toString(),
      referredToName: json['referred_to_profile'] is Map
          ? json['referred_to_profile']['full_name']?.toString()
          : null,
      referredBy: json['referred_by']?.toString(),
      referredByName: json['referred_by_profile'] is Map
          ? json['referred_by_profile']['full_name']?.toString()
          : null,
      adminId: json['admin_id']?.toString(),
      adminName: json['admin'] is Map ? json['admin']['full_name']?.toString() : null,
      lastContact: json['last_contact']?.toString(),
      followUpDue: json['follow_up_due']?.toString(),
      lastActionAt: lastAction,
      lastActionBy: json['last_action_by']?.toString(),
      actionTakenToday: isActionToday,
      hasBeenCalled: json['has_been_called'] == true,
      lastCallAt: json['last_call_at']?.toString(),
      createdAt: json['created_at']?.toString(),
      notes: json['notes']?.toString(),
      location: json['location']?.toString(),
      developer: json['developer']?.toString(),
      project: json['project']?.toString(),
      unit: json['unit']?.toString(),
      interestLevel: json['interest_level']?.toString(),
      leadRating: json['lead_rating']?.toString(),
      priority: json['priority']?.toString() ?? 'Normal',
      team: json['team']?.toString(),
      csAgent: json['cs_agent']?.toString(),
      unitId: json['unit_id']?.toString(),
      unitArea: (json['unit_area'] as num?)?.toDouble() ?? 0.0,
      unitPrice: (json['unit_price'] as num?)?.toDouble() ?? 0.0,
      totalPrice: (json['total_price'] as num?)?.toDouble() ?? 0.0,
      downPayment: (json['down_payment'] as num?)?.toDouble() ?? 0.0,
      downPaymentPct: (json['down_payment_pct'] as num?)?.toDouble() ?? 0.0,
      installmentAmount: (json['installment_amount'] as num?)?.toDouble() ?? 0.0,
      installmentCount: (json['installment_count'] as num?)?.toInt() ?? 0,
      installmentFrequency: (json['installment_frequency'] as num?)?.toInt() ?? 12,
      paymentStartDate: json['payment_start_date']?.toString(),
      reservationAmount: (json['reservation_amount'] as num?)?.toDouble() ?? 0.0,
      maintenanceFees: (json['maintenance_fees'] as num?)?.toDouble() ?? 0.0,
      remainingAmount: (json['remaining_amount'] as num?)?.toDouble() ?? 0.0,
      paymentStatus: json['payment_status']?.toString() ?? 'Not Started',
      reservationDate: json['reservation_date']?.toString(),
      closingDate: json['closing_date']?.toString(),
      finalPrice: (json['final_price'] as num?)?.toDouble() ?? 0.0,
      commission: (json['commission'] as num?)?.toDouble() ?? 0.0,
    );
  }

  /// Convert to Supabase DB row matching leadToRow in crmService.ts
  Map<String, dynamic> toJson({String? currentUserId}) {
    return {
      'name': name,
      'phone': phone,
      'email': email,
      'property_type': propertyType,
      'budget_min': budgetMin,
      'budget_max': budgetMax,
      'source': source,
      'agent': agent,
      'agent_initials': agentInitials,
      'crm_status': status,
      'lead_status': _mapCrmStatusToLegacy(status),
      'last_contact': lastContact,
      'follow_up_due': followUpDue,
      'notes': notes,
      'location': location,
      'developer': developer,
      'project': project,
      'assigned_to': assignedTo,
      'referred_to': referredTo,
      'referred_by': referredBy,
      'unit': unit,
      'interest_level': interestLevel,
      'lead_rating': leadRating,
      'priority': priority,
      'team': team,
      'cs_agent': csAgent,
      'unit_id': unitId,
      'unit_area': unitArea,
      'unit_price': unitPrice,
      'total_price': totalPrice,
      'down_payment': downPayment,
      'down_payment_pct': downPaymentPct,
      'installment_amount': installmentAmount,
      'installment_count': installmentCount,
      'installment_frequency': installmentFrequency,
      'payment_start_date': paymentStartDate,
      'reservation_amount': reservationAmount,
      'maintenanceFees': maintenanceFees,
      'remaining_amount': remainingAmount,
      'payment_status': paymentStatus,
      'reservation_date': reservationDate,
      'closing_date': closingDate,
      'final_price': finalPrice,
      'commission': commission,
      if (currentUserId != null) 'created_by': currentUserId,
    };
  }

  static String _mapCrmStatusToLegacy(String crm) {
    switch (crm) {
      case 'Fresh Leads':
        return 'New';
      case 'Cold Calls':
      case 'Pending Leads':
        return 'Contacted';
      case 'Following Up':
      case 'Interested':
        return 'Qualified';
      case 'Meeting':
        return 'Site Visit Scheduled';
      case 'Done Deal':
        return 'Won';
      case 'Not Interested':
      case 'Cancellation':
      case 'Wrong Number':
      case 'Closed Number':
      case 'Duplicate Leads':
      case 'Data Rotation':
      case 'Low Budget':
        return 'Lost';
      default:
        return 'New';
    }
  }

  LeadModel copyWith({
    String? id,
    String? name,
    String? phone,
    String? email,
    String? propertyType,
    double? budgetMin,
    double? budgetMax,
    String? source,
    String? agent,
    String? agentInitials,
    String? status,
    String? assignedTo,
    String? assignedToName,
    String? notes,
    String? project,
    String? unit,
    String? location,
    String? priority,
    String? followUpDue,
    bool? hasBeenCalled,
    bool? actionTakenToday,
  }) {
    return LeadModel(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      email: email ?? this.email,
      propertyType: propertyType ?? this.propertyType,
      budgetMin: budgetMin ?? this.budgetMin,
      budgetMax: budgetMax ?? this.budgetMax,
      source: source ?? this.source,
      agent: agent ?? this.agent,
      agentInitials: agentInitials ?? this.agentInitials,
      status: status ?? this.status,
      assignedTo: assignedTo ?? this.assignedTo,
      assignedToName: assignedToName ?? this.assignedToName,
      referredTo: referredTo,
      referredToName: referredToName,
      referredBy: referredBy,
      referredByName: referredByName,
      adminId: adminId,
      adminName: adminName,
      lastContact: lastContact,
      followUpDue: followUpDue ?? this.followUpDue,
      lastActionAt: lastActionAt,
      lastActionBy: lastActionBy,
      actionTakenToday: actionTakenToday ?? this.actionTakenToday,
      hasBeenCalled: hasBeenCalled ?? this.hasBeenCalled,
      lastCallAt: lastCallAt,
      createdAt: createdAt,
      notes: notes ?? this.notes,
      location: location ?? this.location,
      developer: developer,
      project: project ?? this.project,
      unit: unit ?? this.unit,
      interestLevel: interestLevel,
      leadRating: leadRating,
      priority: priority ?? this.priority,
      team: team,
      csAgent: csAgent,
      unitId: unitId,
      unitArea: unitArea,
      unitPrice: unitPrice,
      totalPrice: totalPrice,
      downPayment: downPayment,
      downPaymentPct: downPaymentPct,
      installmentAmount: installmentAmount,
      installmentCount: installmentCount,
      installmentFrequency: installmentFrequency,
      paymentStartDate: paymentStartDate,
      reservationAmount: reservationAmount,
      maintenanceFees: maintenanceFees,
      remainingAmount: remainingAmount,
      paymentStatus: paymentStatus,
      reservationDate: reservationDate,
      closingDate: closingDate,
      finalPrice: finalPrice,
      commission: commission,
    );
  }
}

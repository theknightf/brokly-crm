class AssistantMessage {
  final String id;
  final String role; // 'user' or 'assistant'
  final String content;
  final String timestamp;
  final List<dynamic>? toolInvocations;
  final bool isError;

  const AssistantMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.timestamp,
    this.toolInvocations,
    this.isError = false,
  });

  bool get isUser => role == 'user';

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'content': content,
        'timestamp': timestamp,
        if (toolInvocations != null) 'toolInvocations': toolInvocations,
      };

  factory AssistantMessage.fromJson(Map<String, dynamic> json) {
    return AssistantMessage(
      id: json['id'] as String? ?? 'msg_${DateTime.now().millisecondsSinceEpoch}',
      role: json['role'] as String? ?? 'assistant',
      content: json['content'] as String? ?? '',
      timestamp: json['timestamp'] as String? ?? '',
      toolInvocations: json['toolInvocations'] as List<dynamic>?,
      isError: json['isError'] as bool? ?? false,
    );
  }
}

class AssistantLeadMatch {
  final String leadId;
  final String name;
  final String phone;
  final String status;
  final String project;
  final String matchingSnippet;
  final String? noteDate;
  final String? authorAgent;
  final String? whatsappUrl;

  const AssistantLeadMatch({
    required this.leadId,
    required this.name,
    required this.phone,
    required this.status,
    required this.project,
    required this.matchingSnippet,
    this.noteDate,
    this.authorAgent,
    this.whatsappUrl,
  });

  factory AssistantLeadMatch.fromJson(Map<String, dynamic> json) {
    return AssistantLeadMatch(
      leadId: json['leadId'] as String? ?? json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'بدون اسم',
      phone: json['phone'] as String? ?? '',
      status: json['status'] as String? ?? json['stage'] as String? ?? 'Active',
      project: json['project'] as String? ?? '',
      matchingSnippet: json['matchingSnippet'] as String? ?? json['matchingNote'] as String? ?? '',
      noteDate: json['noteDate'] as String?,
      authorAgent: json['authorAgent'] as String?,
      whatsappUrl: json['whatsappUrl'] as String?,
    );
  }
}

class AssistantPendingAction {
  final String action;
  final String message;
  final String? leadId;
  final String? leadName;
  final String? newStage;
  final String? noteText;
  final String? text;

  const AssistantPendingAction({
    required this.action,
    required this.message,
    this.leadId,
    this.leadName,
    this.newStage,
    this.noteText,
    this.text,
  });

  factory AssistantPendingAction.fromJson(Map<String, dynamic> json) {
    return AssistantPendingAction(
      action: json['action'] as String? ?? '',
      message: json['message'] as String? ?? '',
      leadId: json['leadId'] as String?,
      leadName: json['leadName'] as String?,
      newStage: json['newStage'] as String?,
      noteText: json['noteText'] as String?,
      text: json['text'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'action': action,
        'message': message,
        if (leadId != null) 'leadId': leadId,
        if (leadName != null) 'leadName': leadName,
        if (newStage != null) 'newStage': newStage,
        if (noteText != null) 'noteText': noteText,
        if (text != null) 'text': text,
      };
}

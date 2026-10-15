import 'package:flutter/foundation.dart';
import '../data/models/assistant_message_model.dart';
import '../data/services/assistant_service.dart';

class AssistantProvider extends ChangeNotifier {
  final AssistantService _service = AssistantService();

  final List<AssistantMessage> _messages = [];
  bool _isLoading = false;
  String? _error;
  AssistantPendingAction? _pendingAction;
  bool _isConfirmingAction = false;

  List<AssistantMessage> get messages => List.unmodifiable(_messages);
  bool get isLoading => _isLoading;
  String? get error => _error;
  AssistantPendingAction? get pendingAction => _pendingAction;
  bool get isConfirmingAction => _isConfirmingAction;

  /// Send message with strict loading state safety and 15s timeout
  Future<void> sendMessage(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || _isLoading) return;

    final userMsg = AssistantMessage(
      id: 'user_${DateTime.now().millisecondsSinceEpoch}',
      role: 'user',
      content: trimmed,
      timestamp: _formatTime(DateTime.now()),
    );

    _messages.add(userMsg);
    _error = null;
    _isLoading = true;
    notifyListeners();

    try {
      final res = await _service.sendChat(question: trimmed);

      final content = res['content'] as String? ?? '';
      final leadsList = res['leads'] as List<AssistantLeadMatch>?;

      final toolInvocations = (leadsList != null && leadsList.isNotEmpty)
          ? [
              {
                'state': 'result',
                'result': {
                  'leads': leadsList
                      .map((l) => {
                            'leadId': l.leadId,
                            'name': l.name,
                            'phone': l.phone,
                            'status': l.status,
                            'project': l.project,
                            'matchingSnippet': l.matchingSnippet,
                            'whatsappUrl': l.whatsappUrl,
                          })
                      .toList(),
                },
              }
            ]
          : null;

      final botMsg = AssistantMessage(
        id: 'bot_${DateTime.now().millisecondsSinceEpoch}',
        role: 'assistant',
        content: content,
        timestamp: _formatTime(DateTime.now()),
        toolInvocations: toolInvocations,
      );

      _messages.add(botMsg);
    } catch (e) {
      final errorMsg = _parseErrorMessage(e);
      _error = errorMsg;
      _messages.add(AssistantMessage(
        id: 'err_${DateTime.now().millisecondsSinceEpoch}',
        role: 'assistant',
        content: '⚠️ $errorMsg',
        timestamp: _formatTime(DateTime.now()),
        isError: true,
      ));
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Confirm and execute a pending stage update / note addition
  Future<bool> confirmPendingAction() async {
    if (_pendingAction == null || _isConfirmingAction) return false;

    _isConfirmingAction = true;
    notifyListeners();

    try {
      await _service.executeConfirmedAction(_pendingAction!);

      final leadName = _pendingAction!.leadName ?? 'العميل';
      final newStage = _pendingAction!.newStage;
      final note = _pendingAction!.noteText;

      final summaryParts = <String>[];
      if (newStage != null) summaryParts.add('تم تحديث المرحلة إلى "$newStage"');
      if (note != null) summaryParts.add('وتمت إضافة الملاحظة بنجاح');

      _messages.add(AssistantMessage(
        id: 'conf_${DateTime.now().millisecondsSinceEpoch}',
        role: 'assistant',
        content: '✅ تم تنفيذ الإجراء للعميل **$leadName**: ${summaryParts.join(' ')}.',
        timestamp: _formatTime(DateTime.now()),
      ));

      _pendingAction = null;
      return true;
    } catch (e) {
      _error = 'فشل تنفيذ الإجراء: ${e.toString()}';
      return false;
    } finally {
      _isConfirmingAction = false;
      notifyListeners();
    }
  }

  /// Cancel pending action
  void cancelPendingAction() {
    _pendingAction = null;
    _messages.add(AssistantMessage(
      id: 'canc_${DateTime.now().millisecondsSinceEpoch}',
      role: 'assistant',
      content: 'تم إلغاء الإجراء ولم يتم تعديل أي بيانات.',
      timestamp: _formatTime(DateTime.now()),
    ));
    notifyListeners();
  }

  /// Clear entire conversation
  void clearChat() {
    _messages.clear();
    _pendingAction = null;
    _error = null;
    _isLoading = false;
    notifyListeners();
  }

  String _formatTime(DateTime dt) {
    final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final minute = dt.minute.toString().padLeft(2, '0');
    final period = dt.hour >= 12 ? 'م' : 'ص';
    return '$hour:$minute $period';
  }

  String _parseErrorMessage(dynamic error) {
    final str = error.toString();
    if (str.contains('15 ثانية') || str.contains('TimeoutException')) {
      return 'استغرقت الاستجابة وقتاً أطول من المتوقع (مهلة 15 ثانية). برجاء إعادة المحاولة.';
    }
    if (str.contains('SocketException') || str.contains('الإنترنت')) {
      return 'تعذر الاتصال بالإنترنت. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى.';
    }
    if (str.contains('401') || str.contains('غير صالح')) {
      return 'مفتاح Groq API غير صالح أو منتهي الصلاحية.';
    }
    if (str.contains('429') || str.contains('rate limited')) {
      return 'تم الوصول إلى الحد الأقصى للطلبات. برجاء الانتظار ثوانٍ والمحاولة مرة أخرى.';
    }
    return 'حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.';
  }
}

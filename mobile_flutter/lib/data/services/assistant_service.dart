import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/assistant_message_model.dart';
import 'supabase_service.dart';

class AssistantService {
  static final AssistantService _instance = AssistantService._internal();
  factory AssistantService() => _instance;
  AssistantService._internal();

  SupabaseClient get _supabase => SupabaseService().client;

  /// Calls the Supabase Edge Function `ask-brokly` using the user's authenticated session.
  /// RLS is strictly enforced and no API keys reside on the mobile client.
  Future<Map<String, dynamic>> sendChat({
    required String question,
    List<Map<String, String>> history = const [],
  }) async {
    final session = _supabase.auth.currentSession;
    if (session == null) {
      throw const AuthException('برجاء تسجيل الدخول لاستخدام المساعد الذكي.');
    }

    try {
      final response = await _supabase.functions.invoke(
        'ask-brokly',
        body: {'question': question, if (history.isNotEmpty) 'history': history},
      );

      final data = response.data;
      if (response.status != 200 || data == null) {
        final errorMsg = data is Map ? data['error']?.toString() : null;
        throw Exception(_friendlyError(response.status, errorMsg));
      }

      final answer = data['answer'] as String? ?? '';
      final leadsList = data['leads'] as List<dynamic>? ?? [];

      final leadsFound = leadsList.map((l) {
        final m = l as Map<String, dynamic>;
        final phone = m['phone']?.toString() ?? '';
        return AssistantLeadMatch(
          leadId: m['leadId']?.toString() ?? '',
          name: m['name']?.toString() ?? 'بدون اسم',
          phone: phone,
          status: m['status']?.toString() ?? 'Active',
          project: m['project']?.toString() ?? '',
          matchingSnippet: m['notes']?.toString() ?? '',
          whatsappUrl: phone.isNotEmpty ? 'https://wa.me/${phone.replaceAll(RegExp(r'\D'), '')}' : null,
        );
      }).toList();

      return {
        'content': answer,
        'leads': leadsFound,
      };
    } on FunctionException catch (e) {
      final details = e.details;
      final parsedErr = details is Map ? details['error']?.toString() : details?.toString();
      throw Exception(_friendlyError(e.status, parsedErr));
    } on AuthException {
      rethrow;
    } catch (e) {
      if (e is Exception && e.toString().contains('Socket')) {
        throw Exception('تعذر الاتصال بالإنترنت. يرجى التحقق من اتصال الشبكة والمحاولة مرة أخرى.');
      }
      throw Exception('حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.');
    }
  }

  /// A message the agent can act on. The server's own reason (e.g. a Groq model/quota problem) is shown
  /// instead of a generic failure, so a broken setup is diagnosable from the phone. It never contains keys.
  String _friendlyError(int? status, String? serverMsg) {
    if (status == 401) return 'انتهت الجلسة. سجّل الخروج ثم الدخول مرة أخرى.';
    if (status == 429) return 'تم الوصول إلى الحد الأقصى للطلبات. برجاء الانتظار ثوانٍ والمحاولة مرة أخرى.';
    final reason = (serverMsg ?? '').trim();
    if (reason.isEmpty) return 'حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.';
    final short = reason.length > 160 ? '${reason.substring(0, 160)}…' : reason;
    return 'تعذّر الرد من المساعد: $short';
  }

  /// Confirm and execute compound stage update and note creation
  Future<void> executeConfirmedAction(AssistantPendingAction action) async {
    final leadId = action.leadId;
    if (leadId == null || leadId.isEmpty) {
      throw Exception('معرف العميل غير موجود لتنفيذ الإجراء.');
    }

    if (action.newStage != null && action.newStage!.isNotEmpty) {
      await _supabase.from('leads').update({
        'crm_status': action.newStage,
        'updated_at': DateTime.now().toIso8601String(),
      }).eq('id', leadId);
    }

    if (action.noteText != null && action.noteText!.trim().isNotEmpty) {
      final user = _supabase.auth.currentUser;
      await _supabase.from('lead_comments').insert({
        'lead_id': leadId,
        'user_id': user?.id,
        'body': action.noteText!.trim(),
        'created_at': DateTime.now().toIso8601String(),
      });
    }
  }
}

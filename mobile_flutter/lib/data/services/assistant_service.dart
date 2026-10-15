import 'package:flutter/foundation.dart';
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
  }) async {
    final session = _supabase.auth.currentSession;
    if (session == null) {
      throw const AuthException('برجاء تسجيل الدخول لاستخدام المساعد الذكي.');
    }

    try {
      final response = await _supabase.functions.invoke(
        'ask-brokly',
        body: {'question': question},
      );

      final data = response.data;
      if (response.status != 200 || data == null) {
        final errorMsg = data is Map ? data['error']?.toString() : null;
        if (kDebugMode) {
          throw Exception(errorMsg ?? 'Edge Function error (HTTP ${response.status})');
        }
        throw Exception('حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.');
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
      String? parsedErr;
      if (details is Map) {
        parsedErr = details['error']?.toString();
      }
      if (kDebugMode) {
        throw Exception(parsedErr ?? e.details?.toString() ?? e.toString());
      }
      throw Exception('حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.');
    } catch (e) {
      if (kDebugMode) {
        rethrow;
      }
      throw Exception('حدث خطأ في استلام الرد. برجاء المحاولة مجدداً.');
    }
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

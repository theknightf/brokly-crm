import 'dart:async';
import 'dart:convert';
import 'dart:io';
import '../../core/config/env.dart';
import 'supabase_service.dart';

/// One piece of an assistant reply, decoded from the AI SDK data-stream protocol.
sealed class AssistantEvent {}

class AssistantTextDelta extends AssistantEvent {
  final String text;
  AssistantTextDelta(this.text);
}

/// A tool finished and returned data (lead search results, a pending write action, ...).
class AssistantToolResult extends AssistantEvent {
  final Map<String, dynamic> result;
  AssistantToolResult(this.result);
}

class AssistantError extends AssistantEvent {
  final String message;
  AssistantError(this.message);
}

class ChatTurn {
  final String role; // 'user' | 'assistant'
  final String content;
  const ChatTurn(this.role, this.content);
  Map<String, String> toJson() => {'role': role, 'content': content};
}

/// Talks to the web app's /api/assistant. No AI key lives in the app: the request carries the user's own
/// Supabase access token and the server applies the same permissions (RLS) as on the web.
class AssistantService {
  static final AssistantService _instance = AssistantService._();
  factory AssistantService() => _instance;
  AssistantService._();

  bool get isConfigured => Env.apiBaseUrl.isNotEmpty;

  Uri _uri(String path) => Uri.parse('${Env.apiBaseUrl.replaceAll(RegExp(r'/+$'), '')}$path');

  Future<String?> _token() async {
    final supabase = SupabaseService();
    final session = supabase.currentSession;
    if (session == null) return null;
    // Refresh when the token is about to expire.
    final exp = session.expiresAt;
    if (exp != null && exp * 1000 - DateTime.now().millisecondsSinceEpoch < 60000) {
      try {
        final res = await supabase.client.auth.refreshSession();
        return res.session?.accessToken ?? session.accessToken;
      } catch (_) {}
    }
    return session.accessToken;
  }

  /// Streams the assistant's reply for the conversation so far.
  Stream<AssistantEvent> send(List<ChatTurn> history) async* {
    if (!isConfigured) {
      yield AssistantError('المساعد غير مفعّل في هذا الإصدار من التطبيق (API_BASE_URL غير مضبوط).');
      return;
    }
    final token = await _token();
    if (token == null) {
      yield AssistantError('سجّل الدخول أولاً.');
      return;
    }

    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await client.postUrl(_uri('/api/assistant'));
      req.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final recent = history.length > 10 ? history.sublist(history.length - 10) : history;
      req.add(utf8.encode(jsonEncode({'messages': recent.map((t) => t.toJson()).toList()})));
      final res = await req.close().timeout(const Duration(seconds: 60));

      if (res.statusCode != 200) {
        final body = await res.transform(utf8.decoder).join();
        String msg = 'تعذّر الاتصال بالمساعد (${res.statusCode}).';
        try {
          final j = jsonDecode(body);
          if (j is Map && j['error'] != null) msg = j['error'].toString();
        } catch (_) {}
        yield AssistantError(msg);
        return;
      }

      // Data-stream protocol: one part per line, "<code>:<json>". 0 = text delta, a = tool result, 3 = error.
      await for (final line in res.transform(utf8.decoder).transform(const LineSplitter())) {
        if (line.isEmpty) continue;
        final i = line.indexOf(':');
        if (i <= 0) continue;
        final code = line.substring(0, i);
        dynamic payload;
        try {
          payload = jsonDecode(line.substring(i + 1));
        } catch (_) {
          continue;
        }
        switch (code) {
          case '0':
            if (payload is String) yield AssistantTextDelta(payload);
            break;
          case 'a':
            final r = payload is Map ? payload['result'] : null;
            if (r is Map) yield AssistantToolResult(Map<String, dynamic>.from(r));
            break;
          case '3':
            yield AssistantError(payload?.toString() ?? 'حدث خطأ في استلام الرد.');
            break;
        }
      }
    } on TimeoutException {
      yield AssistantError('انتهت مهلة الاتصال. حاول مرة أخرى.');
    } on SocketException {
      yield AssistantError('لا يوجد اتصال بالإنترنت.');
    } catch (_) {
      yield AssistantError('حدث خطأ في استلام الرد.');
    } finally {
      client.close(force: true);
    }
  }

  /// Executes a write action the user confirmed (add note, create follow-up, change stage).
  Future<String> confirm(Map<String, dynamic> action) async {
    final token = await _token();
    if (token == null || !isConfigured) throw Exception('غير مسجّل الدخول.');
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
    try {
      final req = await client.postUrl(_uri('/api/assistant/confirm'));
      req.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final payload = Map<String, dynamic>.from(action)
        ..remove('type')
        ..remove('message')
        ..remove('confirmationRequired')
        ..remove('leadName')
        ..remove('oldStatus')
        ..remove('contactPhone');
      req.add(utf8.encode(jsonEncode(payload)));
      final res = await req.close().timeout(const Duration(seconds: 30));
      final body = await res.transform(utf8.decoder).join();
      final j = jsonDecode(body);
      if (res.statusCode != 200) throw Exception((j is Map ? j['error'] : null) ?? 'فشل تنفيذ الإجراء.');
      return (j is Map ? j['message'] : null)?.toString() ?? 'تم تنفيذ الإجراء.';
    } finally {
      client.close(force: true);
    }
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../state/auth_provider.dart';

class WhatsAppUtils {
  /// Sanitizes Egyptian & international phone numbers for wa.me links
  /// Matches `sanitizeEgyptPhone` in `src/lib/whatsapp.ts`
  static String sanitizeEgyptPhone(String? raw) {
    if (raw == null || raw.trim().isEmpty) return '';
    String digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';

    if (digits.startsWith('00')) {
      digits = digits.substring(2);
    }

    if (digits.startsWith('20') && digits.length == 12) {
      return digits;
    }

    if (digits.startsWith('0') && digits.length == 11) {
      return '2$digits';
    }

    if (digits.length == 10 && digits.startsWith('1')) {
      return '20$digits';
    }

    return digits;
  }

  /// Resolves the currently authenticated user's display name
  static String resolveCurrentUserName(BuildContext? context) {
    if (context != null) {
      try {
        final auth = Provider.of<AuthProvider>(context, listen: false);
        final profileName = auth.profile?.fullName.trim();
        if (profileName != null && profileName.isNotEmpty) {
          return profileName;
        }
        final metaName = auth.user?.userMetadata?['full_name']?.toString().trim();
        if (metaName != null && metaName.isNotEmpty) {
          return metaName;
        }
        final email = auth.profile?.email.trim() ?? auth.user?.email?.trim();
        if (email != null && email.isNotEmpty) {
          return email.split('@').first;
        }
      } catch (_) {}
    }

    final currentUser = Supabase.instance.client.auth.currentUser;
    final metaName = currentUser?.userMetadata?['full_name']?.toString().trim();
    if (metaName != null && metaName.isNotEmpty) {
      return metaName;
    }
    final email = currentUser?.email?.trim();
    if (email != null && email.isNotEmpty) {
      return email.split('@').first;
    }
    return 'مستشار عقاري';
  }

  /// Builds the required Arabic WhatsApp pitch message with the authenticated user's name:
  /// "صباح الخير / مساء الخير، أنا [اسم المستخدم الحالي] من شركة On Point للتسويق العقاري، حابب أعرض على حضرتك وحدات سكنية."
  static String buildDefaultLeadMessage(BuildContext? context, {String? customUserName}) {
    final userName = (customUserName != null && customUserName.trim().isNotEmpty)
        ? customUserName.trim()
        : resolveCurrentUserName(context);

    return 'صباح الخير / مساء الخير، أنا $userName من شركة On Point للتسويق العقاري، حابب أعرض على حضرتك وحدات سكنية.';
  }

  /// Launches WhatsApp deep-link with pre-populated message for a phone number
  static Future<bool> openWhatsAppChat(
    BuildContext context, {
    required String phone,
    String? customMessage,
  }) async {
    final cleanPhone = sanitizeEgyptPhone(phone);
    if (cleanPhone.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid or missing phone number')),
        );
      }
      return false;
    }

    final message = customMessage ?? buildDefaultLeadMessage(context);
    final encodedText = Uri.encodeComponent(message);
    final uri = Uri.parse('https://wa.me/$cleanPhone?text=$encodedText');

    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      return launched;
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open WhatsApp')),
        );
      }
      return false;
    }
  }
}

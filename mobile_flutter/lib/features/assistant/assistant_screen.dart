import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_colors.dart';
import '../../data/services/assistant_service.dart';

class _Msg {
  final bool fromUser;
  String text;
  List<Map<String, dynamic>> leads;
  Map<String, dynamic>? pendingAction;
  bool actionDone;
  bool isError;

  _Msg({
    required this.fromUser,
    this.text = '',
    List<Map<String, dynamic>>? leads,
    this.pendingAction,
    this.actionDone = false,
    this.isError = false,
  }) : leads = leads ?? [];
}

/// Chat with the Brokly assistant (same backend and tools as the web app).
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _service = AssistantService();
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _msgs = [];
  StreamSubscription<AssistantEvent>? _sub;
  bool _busy = false;

  static const _suggestions = [
    'ايه ملخص يومي؟',
    'مين العملاء المتأخرين في المتابعة؟',
    'دورلي على عميل مهتم بالتجمع',
  ];

  @override
  void dispose() {
    _sub?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _send([String? preset]) {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _busy) return;
    _input.clear();

    final history = [
      for (final m in _msgs)
        if (m.text.isNotEmpty && !m.isError) ChatTurn(m.fromUser ? 'user' : 'assistant', m.text),
      ChatTurn('user', text),
    ];
    final reply = _Msg(fromUser: false);
    setState(() {
      _msgs
        ..add(_Msg(fromUser: true, text: text))
        ..add(reply);
      _busy = true;
    });
    _scrollDown();

    _sub = _service.send(history).listen(
      (event) {
        if (!mounted) return;
        setState(() {
          if (event is AssistantTextDelta) {
            reply.text += event.text;
          } else if (event is AssistantToolResult) {
            final r = event.result;
            if (r['type'] == 'pending_action') {
              reply.pendingAction = r;
            } else if (r['leads'] is List) {
              reply.leads = [
                for (final l in (r['leads'] as List))
                  if (l is Map) Map<String, dynamic>.from(l),
              ];
            }
          } else if (event is AssistantError) {
            reply.isError = true;
            reply.text = event.message;
          }
        });
        _scrollDown();
      },
      onDone: () {
        if (!mounted) return;
        setState(() {
          _busy = false;
          if (reply.text.isEmpty && reply.leads.isEmpty && reply.pendingAction == null) {
            reply.isError = true;
            reply.text = 'حدث خطأ في استلام الرد.';
          }
        });
      },
      onError: (_) {
        if (!mounted) return;
        setState(() {
          _busy = false;
          reply.isError = true;
          reply.text = 'حدث خطأ في استلام الرد.';
        });
      },
    );
  }

  Future<void> _confirm(_Msg m) async {
    final action = m.pendingAction;
    if (action == null) return;
    try {
      final message = await _service.confirm(action);
      if (!mounted) return;
      setState(() {
        m.actionDone = true;
        _msgs.add(_Msg(fromUser: false, text: '✅ $message'));
      });
      _scrollDown();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  Future<void> _open(String url) async {
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(LucideIcons.sparkles, size: 18, color: AppColors.neonLime),
            SizedBox(width: 8),
            Text('Brokly AI', style: TextStyle(fontWeight: FontWeight.w800)),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _msgs.isEmpty
                ? _buildEmpty(muted)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                    itemCount: _msgs.length,
                    itemBuilder: (_, i) => _buildMessage(_msgs[i], isDark, muted),
                  ),
          ),
          _buildComposer(isDark),
        ],
      ),
    );
  }

  Widget _buildEmpty(Color muted) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.sparkles, size: 36, color: AppColors.neonLime),
            const SizedBox(height: 12),
            const Text('اسألني عن عملائك', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('ابحث في العملاء والملاحظات، والمتابعات، واكتب رسائل واتساب.',
                textAlign: TextAlign.center, style: TextStyle(color: muted)),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final s in _suggestions)
                  ActionChip(label: Text(s), onPressed: () => _send(s)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessage(_Msg m, bool isDark, Color muted) {
    final bubbleColor = m.fromUser
        ? AppColors.neonLime
        : (m.isError
            ? Colors.red.withAlpha(30)
            : (isDark ? AppColors.darkCard : const Color(0xFFF1F5F9)));
    final textColor = m.fromUser
        ? const Color(0xFF142407)
        : (m.isError ? Colors.redAccent : (isDark ? Colors.white : const Color(0xFF0F172A)));

    return Align(
      alignment: m.fromUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.86),
        child: Column(
          crossAxisAlignment: m.fromUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (m.text.isNotEmpty || (!m.fromUser && _busy && identical(m, _msgs.last)))
              Container(
                margin: const EdgeInsets.symmetric(vertical: 4),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: bubbleColor, borderRadius: BorderRadius.circular(16)),
                child: m.text.isEmpty
                    ? const SizedBox(
                        width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : SelectableText(m.text,
                        style: TextStyle(color: textColor, fontSize: 14, height: 1.4)),
              ),
            for (final l in m.leads) _buildLeadCard(l, isDark, muted),
            if (m.pendingAction != null) _buildPendingCard(m, isDark, muted),
          ],
        ),
      ),
    );
  }

  Widget _buildLeadCard(Map<String, dynamic> l, bool isDark, Color muted) {
    final phone = (l['phone'] ?? '').toString();
    final wa = (l['whatsappUrl'] ?? '').toString();
    final snippet = (l['matchingSnippet'] ?? '').toString();
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isDark ? AppColors.darkBorder : AppColors.lightBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text((l['name'] ?? '').toString(),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              ),
              if ((l['status'] ?? '').toString().isNotEmpty)
                Text(l['status'].toString(),
                    style: const TextStyle(fontSize: 11, color: AppColors.neonLime, fontWeight: FontWeight.w700)),
            ],
          ),
          if (phone.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(phone, style: TextStyle(fontSize: 12, color: muted)),
            ),
          if (snippet.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(snippet, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              if (phone.isNotEmpty)
                OutlinedButton.icon(
                  onPressed: () => _open('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}'),
                  icon: const Icon(LucideIcons.phone, size: 14),
                  label: const Text('اتصال'),
                ),
              const SizedBox(width: 8),
              if (wa.isNotEmpty)
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.neonLime,
                    foregroundColor: const Color(0xFF142407),
                  ),
                  onPressed: () => _open(wa),
                  icon: const Icon(LucideIcons.messageCircle, size: 14),
                  label: const Text('واتساب'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPendingCard(_Msg m, bool isDark, Color muted) {
    final a = m.pendingAction!;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.neonLime.withAlpha(20),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.neonLime.withAlpha(120)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text((a['message'] ?? 'هل تود تنفيذ هذا الإجراء؟').toString(),
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
          if ((a['text'] ?? '').toString().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(a['text'].toString(), style: TextStyle(fontSize: 12.5, color: muted)),
            ),
          const SizedBox(height: 10),
          if (m.actionDone)
            const Text('تم التنفيذ', style: TextStyle(color: AppColors.neonLime, fontWeight: FontWeight.w800))
          else
            Row(
              children: [
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.neonLime,
                    foregroundColor: const Color(0xFF142407),
                  ),
                  onPressed: () => _confirm(m),
                  child: const Text('تأكيد'),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: () => setState(() => m.pendingAction = null),
                  child: const Text('إلغاء'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildComposer(bool isDark) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : Colors.white,
          border: Border(top: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.lightBorder)),
        ),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                decoration: InputDecoration(
                  hintText: 'اكتب سؤالك...',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(22)),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 46,
              height: 46,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  padding: EdgeInsets.zero,
                  backgroundColor: AppColors.neonLime,
                  foregroundColor: const Color(0xFF142407),
                  shape: const CircleBorder(),
                ),
                onPressed: _busy ? null : _send,
                child: const Icon(LucideIcons.send, size: 18),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/whatsapp_utils.dart';
import '../../data/models/assistant_message_model.dart';
import '../../state/assistant_provider.dart';
import '../leads/lead_detail_screen.dart';

class AssistantChatScreen extends StatefulWidget {
  final bool isBottomSheet;

  const AssistantChatScreen({
    super.key,
    this.isBottomSheet = false,
  });

  static Future<void> showAsModal(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const AssistantChatScreen(isBottomSheet: true),
    );
  }

  @override
  State<AssistantChatScreen> createState() => _AssistantChatScreenState();
}

class _AssistantChatScreenState extends State<AssistantChatScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    _textController.clear();
    context.read<AssistantProvider>().sendMessage(trimmed);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<AssistantProvider>();
    final messages = provider.messages;
    final isLoading = provider.isLoading;
    final pendingAction = provider.pendingAction;

    // Auto-scroll when messages or loading state changes
    if (messages.isNotEmpty || isLoading) {
      _scrollToBottom();
    }

    final content = Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : Colors.white,
      appBar: _buildAppBar(context, isDark, provider),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            // Conversation Stream
            Expanded(
              child: messages.isEmpty
                  ? _buildWelcomeHero(context, isDark)
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      itemCount: messages.length + (isLoading ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == messages.length) {
                          return _buildLoadingBubble(isDark);
                        }
                        final msg = messages[index];
                        return _buildMessageItem(context, msg, isDark);
                      },
                    ),
            ),

            // Pending Action Confirmation Card
            if (pendingAction != null) _buildPendingActionCard(context, pendingAction, provider, isDark),

            // Input Bar
            _buildInputBar(context, isDark, isLoading),
          ],
        ),
      ),
    );

    if (widget.isBottomSheet) {
      return Container(
        height: MediaQuery.of(context).size.height * 0.92,
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkBackground : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(isDark ? 160 : 40),
              blurRadius: 30,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: content,
      );
    }

    return content;
  }

  PreferredSizeWidget _buildAppBar(BuildContext context, bool isDark, AssistantProvider provider) {
    return AppBar(
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: isDark ? AppColors.darkCard : Colors.white,
      leading: IconButton(
        icon: Icon(
          widget.isBottomSheet ? LucideIcons.chevronDown : LucideIcons.arrowLeft,
          size: 20,
          color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
        ),
        onPressed: () => Navigator.of(context).pop(),
      ),
      titleSpacing: 0,
      title: Row(
        children: [
          // Glowing Emblem
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.neonLime, AppColors.primary],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(10),
              boxShadow: [
                BoxShadow(
                  color: AppColors.neonLime.withAlpha(100),
                  blurRadius: 10,
                ),
              ],
            ),
            child: const Center(
              child: Icon(LucideIcons.sparkles, color: Color(0xFF142407), size: 18),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Text(
                      'مساعد بروكلي الذكي',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.neonLime.withAlpha(30),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppColors.neonLime.withAlpha(80)),
                      ),
                      child: const Text(
                        'Groq AI',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppColors.neonLime,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: Color(0xFF22C55E),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Online • Active 120B / 70B',
                      style: TextStyle(
                        fontSize: 10,
                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: Icon(
            LucideIcons.rotateCcw,
            size: 18,
            color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
          ),
          tooltip: 'محادثة جديدة',
          onPressed: () => provider.clearChat(),
        ),
      ],
    );
  }

  Widget _buildWelcomeHero(BuildContext context, bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Ambient Card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isDark
                    ? [const Color(0xFF161E28), const Color(0xFF0F141C)]
                    : [const Color(0xFFF0FDF4), const Color(0xFFFFFFFF)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: isDark ? AppColors.neonLime.withAlpha(50) : AppColors.primary.withAlpha(40),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withAlpha(isDark ? 80 : 15),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(LucideIcons.sparkles, size: 16, color: AppColors.neonLime),
                        SizedBox(width: 6),
                        Text(
                          'مركز الذكاء العقاري الفوري',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppColors.neonLime,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.neonLime.withAlpha(25),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'Brokly Copilot',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.neonLime,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'أهلاً بك! إزاي أقدر أساعدك اليوم؟',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'اسألني عن رغبات العملاء وملاحظاتهم، ملخص متابعات اليوم المتأخرة، أو اطلب صياغة رسائل واتساب بيعية مخصصة.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          Text(
            'مهام سريعة مقترحة:',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              fontFamily: 'monospace',
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
          ),
          const SizedBox(height: 10),

          // Shortcut Pills
          _buildShortcutPill(
            icon: LucideIcons.zap,
            iconColor: AppColors.neonLime,
            title: 'مين العميل اللي سأل عن النرجس؟',
            onTap: () => _sendMessage('مين العميل اللي سأل عن النرجس؟'),
            isDark: isDark,
          ),
          const SizedBox(height: 8),
          _buildShortcutPill(
            icon: LucideIcons.trendingUp,
            iconColor: const Color(0xFF22C55E),
            title: 'هاتلي ملخص متابعات اليوم والمتابعات المتأخرة',
            onTap: () => _sendMessage('هاتلي ملخص متابعات اليوم والمتابعات المتأخرة'),
            isDark: isDark,
          ),
          const SizedBox(height: 8),
          _buildShortcutPill(
            icon: LucideIcons.messageCircle,
            iconColor: const Color(0xFF10B981),
            title: 'اكتبلي رسالة واتساب ودية لمتابعة زيارة موقع',
            onTap: () => _sendMessage('اكتبلي رسالة واتساب ودية للعميل لمتابعة زيارة موقع'),
            isDark: isDark,
          ),
          const SizedBox(height: 8),
          _buildShortcutPill(
            icon: LucideIcons.shieldCheck,
            iconColor: AppColors.amber,
            title: 'آخر عميل كلمته مهتم وعاوز يشتري في العبور',
            onTap: () => _sendMessage('آخر عميل أنا كلمته مهتم وعاوز يشتري في العبور'),
            isDark: isDark,
          ),
        ],
      ),
    );
  }

  Widget _buildShortcutPill({
    required IconData icon,
    required Color iconColor,
    required String title,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkCard : AppColors.lightMuted,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: iconColor.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(child: Icon(icon, size: 14, color: iconColor)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
              ),
            ),
            Icon(
              LucideIcons.arrowRight,
              size: 14,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageItem(BuildContext context, AssistantMessage msg, bool isDark) {
    final isUser = msg.isUser;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 28,
              height: 28,
              margin: const EdgeInsets.only(top: 2, right: 8),
              decoration: BoxDecoration(
                color: AppColors.neonLime.withAlpha(30),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.neonLime.withAlpha(70)),
              ),
              child: const Center(
                child: Icon(LucideIcons.bot, size: 15, color: AppColors.neonLime),
              ),
            ),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                // Sender & Timestamp
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  child: Text(
                    '${isUser ? 'أنت' : 'Brokly AI'} • ${msg.timestamp}',
                    style: TextStyle(
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                  ),
                ),

                // Bubble
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: isUser
                        ? (isDark ? const Color(0xFF272F3D) : const Color(0xFF1E293B))
                        : (isDark ? AppColors.darkCard : const Color(0xFFF1F5F9)),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: isUser ? const Radius.circular(16) : const Radius.circular(4),
                      bottomRight: isUser ? const Radius.circular(4) : const Radius.circular(16),
                    ),
                    border: Border.all(
                      color: isUser
                          ? (isDark ? const Color(0xFF384357) : const Color(0xFF334155))
                          : (isDark ? AppColors.darkBorder : AppColors.lightBorder),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withAlpha(isDark ? 50 : 15),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: SelectableText(
                    msg.content,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.45,
                      color: isUser
                          ? Colors.white
                          : (isDark ? AppColors.darkForeground : AppColors.lightForeground),
                    ),
                  ),
                ),

                // Lead Cards from Tool Output
                if (msg.toolInvocations != null) ...[
                  for (final inv in msg.toolInvocations!) ...[
                    _buildToolInvocations(context, inv, isDark),
                  ],
                ],
              ],
            ),
          ),
          if (isUser) ...[
            Container(
              width: 28,
              height: 28,
              margin: const EdgeInsets.only(top: 2, left: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF272F3D) : const Color(0xFFE2E8F0),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Icon(
                  LucideIcons.user,
                  size: 15,
                  color: isDark ? Colors.white : AppColors.lightForeground,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildToolInvocations(BuildContext context, dynamic inv, bool isDark) {
    if (inv is! Map<String, dynamic>) return const SizedBox.shrink();
    final res = inv['result'];
    if (res is! Map<String, dynamic>) return const SizedBox.shrink();

    final leadsList = res['leads'];
    if (leadsList is! List || leadsList.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        children: [
          for (final rawLead in leadsList)
            if (rawLead is Map<String, dynamic>)
              _buildLeadResultCard(context, AssistantLeadMatch.fromJson(rawLead), isDark),
        ],
      ),
    );
  }

  Widget _buildLeadResultCard(BuildContext context, AssistantLeadMatch lead, bool isDark) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F141D) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.neonLime.withAlpha(isDark ? 80 : 120),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 80 : 15),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AppColors.neonLime,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    lead.name,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: isDark ? Colors.white : AppColors.lightForeground,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.neonLime.withAlpha(25),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.neonLime.withAlpha(60)),
                ),
                child: Text(
                  lead.status,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.neonLime,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ],
          ),

          if (lead.matchingSnippet.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF070A0F) : AppColors.lightMuted,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'المطابقة: "${lead.matchingSnippet}"',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                ),
              ),
            ),
          ],

          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (lead.phone.isNotEmpty) ...[
                InkWell(
                  onTap: () => WhatsAppUtils.openWhatsAppChat(context, phone: lead.phone),
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF22C55E).withAlpha(25),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFF22C55E).withAlpha(60)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(LucideIcons.messageCircle, size: 12, color: Color(0xFF22C55E)),
                        SizedBox(width: 4),
                        Text(
                          'واتساب',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF22C55E),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              InkWell(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => LeadDetailScreen(leadId: lead.leadId),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.neonLime.withAlpha(25),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.neonLime.withAlpha(60)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(LucideIcons.externalLink, size: 12, color: AppColors.neonLime),
                      SizedBox(width: 4),
                      Text(
                        'عرض ملف العميل',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.neonLime,
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
    );
  }

  Widget _buildLoadingBubble(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: AppColors.neonLime.withAlpha(30),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Center(
              child: SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.neonLime,
                ),
              ),
            ),
          ),
          Text(
            'جاري المعالجة والبحث في بيانات CRM...',
            style: TextStyle(
              fontSize: 11,
              fontFamily: 'monospace',
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPendingActionCard(
    BuildContext context,
    AssistantPendingAction action,
    AssistantProvider provider,
    bool isDark,
  ) {
    final isConfirming = provider.isConfirmingAction;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF26190B) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.amber.withAlpha(120), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(isDark ? 100 : 20),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(LucideIcons.alertCircle, size: 16, color: AppColors.amber),
              SizedBox(width: 6),
              Text(
                'تأكيد الإجراء المطلوب قبل التنفيذ',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.amber,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            action.message,
            style: TextStyle(
              fontSize: 12,
              height: 1.45,
              color: isDark ? Colors.white : const Color(0xFF78350F),
            ),
          ),
          if (action.newStage != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  'المرحلة الجديدة: ',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppColors.darkMutedForeground : const Color(0xFF92400E),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.neonLime.withAlpha(30),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.neonLime.withAlpha(80)),
                  ),
                  child: Text(
                    action.newStage!,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.neonLime,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (action.noteText != null && action.noteText!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withAlpha(80) : Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '"${action.noteText}"',
                style: TextStyle(
                  fontSize: 11,
                  color: isDark ? Colors.white70 : Colors.black87,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton(
                onPressed: isConfirming ? null : () => provider.cancelPendingAction(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: isDark ? Colors.white70 : Colors.black87,
                  side: BorderSide(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('إلغاء', style: TextStyle(fontSize: 11)),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: isConfirming ? null : () => provider.confirmPendingAction(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.neonLime,
                  foregroundColor: const Color(0xFF142407),
                  elevation: 2,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: isConfirming
                    ? const SizedBox(
                        width: 12,
                        height: 12,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF142407),
                        ),
                      )
                    : const Icon(LucideIcons.check, size: 14),
                label: const Text(
                  'تأكيد وتنفيذ في النظام',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInputBar(BuildContext context, bool isDark, bool isLoading) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                ),
              ),
              child: TextField(
                controller: _textController,
                focusNode: _focusNode,
                textDirection: TextDirection.rtl,
                style: TextStyle(
                  fontSize: 13,
                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                ),
                decoration: InputDecoration(
                  hintText: 'اسأل عن العملاء، الملاحظات، أو أحدث المبيعات...',
                  hintStyle: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                  ),
                  hintTextDirection: TextDirection.rtl,
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                ),
                onSubmitted: isLoading ? null : _sendMessage,
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: isLoading ? null : () => _sendMessage(_textController.text),
            borderRadius: BorderRadius.circular(14),
            child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.neonLime, AppColors.primary],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.neonLime.withAlpha(80),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: Center(
                child: isLoading
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Color(0xFF142407),
                        ),
                      )
                    : const Icon(LucideIcons.send, size: 16, color: Color(0xFF142407)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

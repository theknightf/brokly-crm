import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/models/call_log_model.dart';
import '../../../data/models/lead_model.dart';
import '../../../state/call_logs_provider.dart';

class LogCallDialog extends StatefulWidget {
  final LeadModel lead;
  final String initialChannel;

  const LogCallDialog({
    super.key,
    required this.lead,
    this.initialChannel = 'Call',
  });

  static Future<void> show(
    BuildContext context, {
    required LeadModel lead,
    String initialChannel = 'Call',
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => LogCallDialog(
        lead: lead,
        initialChannel: initialChannel,
      ),
    );
  }

  @override
  State<LogCallDialog> createState() => _LogCallDialogState();
}

class _LogCallDialogState extends State<LogCallDialog> {
  late String _channel;
  String _outcome = 'Connected';
  int _durationSeconds = 60;
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _channels = ['Call', 'WhatsApp', 'Meeting', 'Site Visit'];
  final List<String> _outcomes = [
    'Connected',
    'Interested',
    'Site Visit',
    'Meeting',
    'Won Deal',
    'Not Interested',
    'No Answer',
    'Wrong Number',
  ];

  @override
  void initState() {
    super.initState();
    _channel = widget.initialChannel;
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);

    final callLog = CallLogModel(
      id: '',
      entityType: 'lead',
      entityId: widget.lead.id,
      contactName: widget.lead.name,
      contactPhone: widget.lead.phone,
      channel: _channel,
      durationSeconds: _durationSeconds,
      outcome: _outcome,
      notes: _notesController.text.trim(),
      projectName: widget.lead.project,
    );

    await context.read<CallLogsProvider>().logCall(callLog);

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Logged $_channel with ${widget.lead.name}'),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: 20 + bottomInset,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Log Touchpoint',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                    Text(
                      '${widget.lead.name} • ${widget.lead.phone}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(LucideIcons.x, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Channel Picker
            Text(
              'Channel',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: _channels.map((ch) {
                final isSelected = ch == _channel;
                return ChoiceChip(
                  label: Text(ch),
                  selected: isSelected,
                  selectedColor: AppColors.primary,
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                  onSelected: (val) {
                    if (val) setState(() => _channel = ch);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // Outcome Picker
            Text(
              'Call / Contact Outcome',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _outcomes.map((out) {
                final isSelected = out == _outcome;
                final outcomeColor = AppColors.getOutcomeColor(out);
                return ChoiceChip(
                  label: Text(out),
                  selected: isSelected,
                  selectedColor: outcomeColor,
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : (isDark ? Colors.white70 : Colors.black87),
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                  onSelected: (val) {
                    if (val) setState(() => _outcome = out);
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // Duration Slider
            if (_channel == 'Call') ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Duration',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                    ),
                  ),
                  Text(
                    '${_durationSeconds ~/ 60}m ${_durationSeconds % 60}s',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ],
              ),
              Slider(
                value: _durationSeconds.toDouble(),
                min: 0,
                max: 600,
                divisions: 60,
                activeColor: AppColors.primary,
                onChanged: (val) => setState(() => _durationSeconds = val.toInt()),
              ),
              const SizedBox(height: 8),
            ],

            // Notes Field
            Text(
              'Notes & Next Actions',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Discussed project brochure, interest in 2BHK unit…',
              ),
            ),
            const SizedBox(height: 20),

            // Submit Button
            ElevatedButton(
              onPressed: _isSubmitting ? null : _submit,
              child: _isSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Save Touchpoint'),
            ),
          ],
        ),
      ),
    );
  }
}

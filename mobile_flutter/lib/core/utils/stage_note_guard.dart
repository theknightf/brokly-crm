import 'package:flutter/material.dart';
import '../../data/services/leads_service.dart';
import '../../data/services/supabase_service.dart';
import 'tr.dart';

/// Sales users cannot change a lead's stage without a written note (the database enforces it too; owners and admins are
/// exempt). This asks for the note first, saves it as a lead comment, and only then runs the stage change.
class StageNoteGuard {
  static bool? _isAdmin;

  /// Owner / admin. Cached after the first lookup; an unknown answer is treated as "sales" (the stricter side).
  static Future<bool> isAdmin() async {
    final cached = _isAdmin;
    if (cached != null) return cached;
    try {
      final uid = SupabaseService().currentUser?.id;
      if (uid == null) return false;
      final row = await SupabaseService().client.from('user_profiles').select('role').eq('id', uid).maybeSingle();
      final r = (row?['role']?.toString() ?? '').toLowerCase().trim().replaceAll('-', '_');
      _isAdmin = r == 'owner' || r == 'admin' || r == 'owner_admin' || r == 'owneradmin';
      return _isAdmin!;
    } catch (_) {
      return false;
    }
  }

  /// Forget the cached role (call on sign-out).
  static void reset() => _isAdmin = null;

  /// Runs [apply] (the stage change) after the note was written. Returns false when the user cancelled.
  static Future<bool> run(
    BuildContext context, {
    required String leadId,
    required String leadName,
    required String newStage,
    required Future<void> Function() apply,
  }) async {
    if (await isAdmin()) {
      await apply();
      return true;
    }
    if (!context.mounted) return false;
    final note = await ask(context, leadName: leadName, stage: newStage);
    if (note == null || note.trim().isEmpty) return false;
    try {
      await LeadsService().addComment(leadId, note.trim());
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Could not save the note, so the stage was not changed.', 'تعذّر حفظ الملاحظة، فلم تتغير المرحلة.'))),
        );
      }
      return false;
    }
    await apply();
    return true;
  }

  /// The "write a note first" sheet. Returns the note, or null when cancelled.
  static Future<String?> ask(BuildContext context, {required String leadName, required String stage}) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _NoteSheet(leadName: leadName, stage: stage),
    );
  }
}

class _NoteSheet extends StatefulWidget {
  final String leadName;
  final String stage;
  const _NoteSheet({required this.leadName, required this.stage});

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.of(context).viewInsets.bottom;
    final ok = _controller.text.trim().isNotEmpty;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + inset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tr('Write a note first', 'اكتب ملاحظة أولاً'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.leadName} → ${widget.stage}',
            style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurface.withAlpha(160)),
          ),
          const SizedBox(height: 4),
          Text(
            tr('The stage changes only after you write what happened.', 'المرحلة بتتغير بعد ما تكتب إيه اللي حصل.'),
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withAlpha(140)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            minLines: 3,
            maxLines: 5,
            maxLength: 1000,
            textInputAction: TextInputAction.newline,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: tr('What happened?', 'إيه اللي حصل؟'),
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(tr('Cancel', 'إلغاء')),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: ok ? () => Navigator.pop(context, _controller.text.trim()) : null,
                  child: Text(tr('Save note & change stage', 'حفظ الملاحظة وتغيير المرحلة')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/expenses_model.dart';
import 'supabase_service.dart';

/// Thrown when the `expenses` table does not exist yet (mirrors web `notInitialized`).
class ExpensesNotInitialized implements Exception {
  @override
  String toString() => 'The expenses table has not been created in Supabase yet.';
}

/// CRUD for office expenses. RLS restricts every operation to owners/admins.
class ExpensesService {
  final SupabaseClient _client = SupabaseService().client;

  static String isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static double normalizeAmount(num? v) {
    if (v == null || !v.isFinite || v < 0) return 0;
    return (v * 100).round() / 100;
  }

  Future<List<ExpenseModel>> getAll({String? from, String? to, String? category}) async {
    try {
      var q = _client.from('expenses').select('*');
      if (from != null && from.isNotEmpty) q = q.gte('expense_date', from);
      if (to != null && to.isNotEmpty) q = q.lte('expense_date', to);
      if (category != null && category.isNotEmpty && category != 'All') q = q.eq('category', category);
      final data = await q.order('expense_date', ascending: false).order('created_at', ascending: false);
      return (data as List<dynamic>).map((e) => ExpenseModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('does not exist') || msg.contains('could not find') || msg.contains('schema cache')) {
        throw ExpensesNotInitialized();
      }
      rethrow;
    }
  }

  Future<void> create({
    required String title,
    required String category,
    required double amount,
    required String expenseDate,
    String notes = '',
  }) async {
    await _client.from('expenses').insert({
      'title': title.trim(),
      'category': category.trim().isEmpty ? 'Other' : category.trim(),
      'amount': normalizeAmount(amount),
      'expense_date': expenseDate,
      'notes': notes,
      'created_by': _client.auth.currentUser?.id,
    });
  }

  Future<void> update(
    String id, {
    required String title,
    required String category,
    required double amount,
    required String expenseDate,
    String notes = '',
  }) async {
    await _client.from('expenses').update({
      'title': title.trim(),
      if (category.trim().isNotEmpty) 'category': category.trim(),
      'amount': normalizeAmount(amount),
      'expense_date': expenseDate,
      'notes': notes,
    }).eq('id', id);
  }

  Future<void> delete(String id) async {
    await _client.from('expenses').delete().eq('id', id);
  }
}

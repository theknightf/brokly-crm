/// Row of the `expenses` table (admin/owner only).
class ExpenseModel {
  final String id;
  final String title;
  final String category;
  final double amount;
  final String expenseDate; // yyyy-MM-dd
  final String notes;
  final String? createdAt;

  const ExpenseModel({
    required this.id,
    this.title = '',
    this.category = 'Other',
    this.amount = 0,
    this.expenseDate = '',
    this.notes = '',
    this.createdAt,
  });

  factory ExpenseModel.fromJson(Map<String, dynamic> j) {
    final rawDate = j['expense_date']?.toString() ?? '';
    return ExpenseModel(
      id: j['id']?.toString() ?? '',
      title: j['title']?.toString() ?? '',
      category: (j['category']?.toString().trim().isNotEmpty ?? false) ? j['category'].toString().trim() : 'Other',
      amount: double.tryParse(j['amount']?.toString() ?? '') ?? 0,
      expenseDate: rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate,
      notes: j['notes']?.toString() ?? '',
      createdAt: j['created_at']?.toString(),
    );
  }

  DateTime? get date => DateTime.tryParse(expenseDate);
}

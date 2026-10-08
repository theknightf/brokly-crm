import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../state/attendance_provider.dart';
import 'widgets/attendance_history_list.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  Timer? _clockTimer;
  DateTime _currentTime = DateTime.now();
  int _historyTabIndex = 0; // 0: Week, 1: Month

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _currentTime = DateTime.now());
      }
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final provider = context.watch<AttendanceProvider>();
    final isCheckedIn = provider.isCheckedIn;
    final isCheckedOut = provider.isCheckedOut;
    final isBusy = provider.isBusy;
    final busyPhase = provider.busyPhase;

    final timeString = DateFormat('HH:mm:ss').format(_currentTime);
    final dayString = DateFormat('EEEE').format(_currentTime);
    final dateString = DateFormat('d MMMM yyyy').format(_currentTime);

    // Calculate Week vs Month stats
    final history = provider.history;
    final daysPresent = history.length;
    final completeDays = history.where((a) => a.isCheckedIn && a.isCheckedOut).length;
    final totalHoursMinutes = history.fold<int>(0, (sum, a) => sum + a.durationMinutes);
    final totalHours = (totalHoursMinutes / 60).toStringAsFixed(1);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () => provider.init(),
        color: AppColors.neonLime,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── 1. Digital Clock & Shift Header ────────────────
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withAlpha(isDark ? 40 : 10),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    // Shift pill & GPS pill row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Shift pill badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF142407) : const Color(0xFFF0FCD8),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: AppColors.neonLime.withAlpha(120)),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(LucideIcons.calendarClock, size: 12, color: AppColors.neonLime),
                              SizedBox(width: 5),
                              Text(
                                'Shift: 12:00 PM – 8:00 PM',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.neonLime,
                                ),
                              ),
                            ],
                          ),
                        ),

                        // GPS Status badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: isDark ? AppColors.darkBackground : AppColors.lightMuted,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF22C55E),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                'GPS Verified',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // Real-time Digital Clock
                    Text(
                      timeString,
                      style: TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2,
                        color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$dayString, $dateString',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
                      ),
                    ),
                    const SizedBox(height: 20),

                    // ── Neon Green Check-In / Check-Out CTA Button
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isCheckedOut
                              ? (isDark ? const Color(0xFF27272A) : const Color(0xFFE4E4E7))
                              : AppColors.neonLime,
                          foregroundColor: isCheckedOut
                              ? (isDark ? Colors.white60 : Colors.black54)
                              : const Color(0xFF142407),
                          elevation: isCheckedOut ? 0 : 4,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          shadowColor: AppColors.neonLime.withAlpha(120),
                        ),
                        onPressed: isBusy || isCheckedOut
                            ? null
                            : () async {
                                if (!isCheckedIn) {
                                  await provider.checkIn();
                                } else {
                                  await provider.checkOut();
                                }
                              },
                        child: isBusy
                            ? Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Color(0xFF142407),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    busyPhase.isNotEmpty ? busyPhase : 'Verifying GPS & Saving...',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF142407),
                                    ),
                                  ),
                                ],
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    isCheckedOut
                                        ? LucideIcons.circleCheck
                                        : isCheckedIn
                                            ? LucideIcons.logOut
                                            : LucideIcons.logIn,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    isCheckedOut
                                        ? 'تم تسجيل الانصراف / Completed'
                                        : isCheckedIn
                                            ? 'تسجيل الانصراف / Check-out'
                                            : 'تسجيل الحضور / Check-in',
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Helper Text
                    const Text(
                      'لا يمكن تعديل الوقت — يُحفظ تلقائياً من السيرفر',
                      style: TextStyle(
                        fontSize: 11,
                        color: Color(0xFF9CA3AF),
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // ── 2. Daily Metrics: Hours Today, Delay, Leave Used
              Row(
                children: [
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Hours today',
                      value: provider.durationString ?? (isCheckedIn ? 'In progress' : '--'),
                      icon: LucideIcons.timer,
                      color: AppColors.neonLime,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Delay',
                      value: '0 min',
                      icon: LucideIcons.alertCircle,
                      color: AppColors.amber,
                      isDark: isDark,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricCard(
                      title: 'Leave used',
                      value: '1 / 2 days',
                      icon: LucideIcons.calendarX,
                      color: AppColors.tealCyan,
                      isDark: isDark,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // ── 3. Attendance History Section with Week/Month Tabs
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Attendance History',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      fontFamily: 'serif',
                      color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
                    ),
                  ),
                  // Week / Month switcher
                  Container(
                    height: 32,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkCard : Colors.white,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                      ),
                    ),
                    child: Row(
                      children: [
                        _buildTabButton('Week', 0, isDark),
                        _buildTabButton('Month', 1, isDark),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Summary Stats Row: Days present, Complete days, Total hours
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkCard : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildStatItem('Days present', daysPresent.toString(), AppColors.neonLime),
                    _buildDivider(isDark),
                    _buildStatItem('Complete days', completeDays.toString(), const Color(0xFF22C55E)),
                    _buildDivider(isDark),
                    _buildStatItem('Total hours', '${totalHours}h', const Color(0xFF38BDF8)),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // History list items
              AttendanceHistoryList(history: provider.history),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetricCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: isDark ? AppColors.darkForeground : AppColors.lightForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            title,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String text, int index, bool isDark) {
    final isSelected = _historyTabIndex == index;
    return InkWell(
      onTap: () => setState(() => _historyTabIndex = index),
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.neonLime : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
            color: isSelected
                ? const Color(0xFF142407)
                : (isDark ? AppColors.darkMutedForeground : AppColors.lightMutedForeground),
          ),
        ),
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFF9CA3AF),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  Widget _buildDivider(bool isDark) {
    return Container(
      width: 1,
      height: 24,
      color: isDark ? AppColors.darkBorder : AppColors.lightBorder,
    );
  }
}

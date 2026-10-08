import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/date_utils.dart';
import '../../../state/attendance_provider.dart';

class AttendanceHeroCard extends StatelessWidget {
  const AttendanceHeroCard({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AttendanceProvider>();
    final today = provider.today;
    final isCheckedIn = provider.isCheckedIn;
    final isCheckedOut = provider.isCheckedOut;
    final isBusy = provider.isBusy;
    final busyPhase = provider.busyPhase;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF181B22), // Dark Slate hero card matching PWA
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withAlpha(25)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(120),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              // Icon Badge
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: isCheckedIn && !isCheckedOut
                      ? AppColors.primary.withAlpha(40)
                      : isCheckedOut
                          ? Colors.white.withAlpha(20)
                          : AppColors.primary,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isCheckedIn && !isCheckedOut
                        ? AppColors.primary.withAlpha(100)
                        : isCheckedOut
                            ? Colors.white.withAlpha(30)
                            : AppColors.accent,
                  ),
                ),
                child: Center(
                  child: provider.isLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : isCheckedOut
                          ? const Icon(LucideIcons.checkCircle2, color: Colors.white70, size: 22)
                          : isCheckedIn
                              ? const Icon(LucideIcons.logOut, color: AppColors.primaryDark, size: 22)
                              : const Icon(LucideIcons.logIn, color: Color(0xFF0F172A), size: 22),
                ),
              ),
              const SizedBox(width: 14),

              // Status Text
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isCheckedOut
                          ? 'تم تسجيل الانصراف'
                          : isCheckedIn
                              ? 'تم تسجيل الحضور'
                              : 'تسجيل الحضور',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isCheckedOut
                          ? 'Checked out'
                          : isCheckedIn
                              ? 'Checked in'
                              : 'Check in for today',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                    const SizedBox(height: 4),
                    if (isCheckedIn)
                      Row(
                        children: [
                          Text(
                            'In ${AppDateUtils.formatTime(today?.checkInTime)}',
                            style: const TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                          if (today?.hasGps ?? false) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withAlpha(30),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(LucideIcons.mapPin, color: AppColors.primaryDark, size: 10),
                                  SizedBox(width: 3),
                                  Text(
                                    'GPS',
                                    style: TextStyle(
                                      color: AppColors.primaryDark,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          if (isCheckedOut) ...[
                            const SizedBox(width: 6),
                            Text(
                              '· Out ${AppDateUtils.formatTime(today?.checkOutTime)}',
                              style: const TextStyle(color: Colors.white54, fontSize: 12),
                            ),
                          ],
                        ],
                      )
                    else
                      const Text(
                        'You are not marked present for today.',
                        style: TextStyle(color: Colors.white54, fontSize: 11),
                      ),
                  ],
                ),
              ),

              // Action Button
              ElevatedButton(
                onPressed: isBusy || isCheckedOut
                    ? null
                    : () {
                        if (isCheckedIn) {
                          provider.checkOut();
                        } else {
                          provider.checkIn();
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: isCheckedIn
                      ? const Color(0xFFEF4444)
                      : AppColors.primary,
                  foregroundColor: isCheckedIn ? Colors.white : const Color(0xFF0F172A),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  minimumSize: Size.zero,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: isBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isCheckedIn ? LucideIcons.logOut : LucideIcons.logIn,
                            size: 15,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            isCheckedIn ? 'Check out' : 'Check in',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                          ),
                        ],
                      ),
              ),
            ],
          ),

          // Busy Phase indicator
          if (isBusy && busyPhase.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryDark),
                ),
                const SizedBox(width: 8),
                Text(
                  busyPhase,
                  style: const TextStyle(color: AppColors.primaryDark, fontSize: 12),
                ),
              ],
            ),
          ],

          // Error banner
          if (provider.error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withAlpha(40),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFEF4444).withAlpha(80)),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.alertCircle, color: Color(0xFFEF4444), size: 16),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      provider.error!,
                      style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

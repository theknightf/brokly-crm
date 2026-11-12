import 'package:flutter/material.dart';
import '../../data/services/deals_service.dart';
import '../deals/deals_list_view.dart';

/// Leads with an active reservation (crm_status = 'Reservation').
class ReservationsScreen extends StatelessWidget {
  final bool showAppBar;
  const ReservationsScreen({super.key, this.showAppBar = false});

  @override
  Widget build(BuildContext context) => DealsListView(
        status: DealsService.reservation,
        subtitle: 'Leads with an active reservation',
        appBarTitle: 'Reservations',
        showAppBar: showAppBar,
      );
}

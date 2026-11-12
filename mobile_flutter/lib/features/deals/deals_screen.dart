import 'package:flutter/material.dart';
import '../../data/services/deals_service.dart';
import 'deals_list_view.dart';

/// Won deals and closed sales (leads with crm_status = 'Done Deal').
class DealsScreen extends StatelessWidget {
  final bool showAppBar;
  const DealsScreen({super.key, this.showAppBar = false});

  @override
  Widget build(BuildContext context) => DealsListView(
        status: DealsService.doneDeal,
        subtitle: 'Won deals and closed sales',
        appBarTitle: 'Deals',
        showAppBar: showAppBar,
      );
}

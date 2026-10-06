import 'package:flutter/material.dart';
import '../models/sponsor_ad.dart';
import '../services/sponsor_ads_service.dart';
import 'sponsor_ad_banner.dart';

/// Anúncios dos apoiadores (globais da ACN), empilhados no topo das telas
/// principais. Melhor esforço: sem internet ou sem anúncios, não ocupa espaço.
class AdsStack extends StatefulWidget {
  const AdsStack({super.key});

  @override
  State<AdsStack> createState() => _AdsStackState();
}

class _AdsStackState extends State<AdsStack> {
  List<SponsorAd> _ads = const [];

  @override
  void initState() {
    super.initState();
    SponsorAdsService().fetchAll().then((a) {
      if (mounted) setState(() => _ads = a);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_ads.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        children: [
          for (final ad in _ads) ...[
            SponsorAdBanner(ad: ad),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

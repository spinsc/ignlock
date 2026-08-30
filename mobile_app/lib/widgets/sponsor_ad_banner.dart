import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/sponsor_ad.dart';

/// Card discreto de patrocinador — pensado para a tela inicial (idle),
/// nunca para o fluxo de liberação em si (NFC/BLE/formulário/emergência):
/// segurança não compete por atenção com anúncio. Ver docs/13-patrocinadores.md.
class SponsorAdBanner extends StatelessWidget {
  final SponsorAd ad;

  const SponsorAdBanner({super.key, required this.ad});

  Future<void> _open() async {
    final url = ad.linkUrl;
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: ad.linkUrl != null ? _open : null,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: theme.dividerColor),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.network(
                ad.imageUrl,
                width: 40,
                height: 40,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox(width: 40, height: 40),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    ad.headline ?? ad.sponsorName,
                    style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    'Patrocinado · ${ad.sponsorName}',
                    style: theme.textTheme.labelSmall?.copyWith(color: theme.hintColor),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

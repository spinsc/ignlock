/// Anúncio de patrocinador (ver painel → aba Patrocinadores e
/// docs/13-patrocinadores.md). Exibido de forma discreta na tela inicial
/// do app — nunca durante o fluxo de liberação em si (NFC/BLE/formulário),
/// para não distrair numa operação de segurança.
class SponsorAd {
  final String id;
  final String sponsorName;
  final String? headline;
  final String imageUrl;
  final String? linkUrl;
  final int weight;

  SponsorAd({
    required this.id,
    required this.sponsorName,
    this.headline,
    required this.imageUrl,
    this.linkUrl,
    required this.weight,
  });

  factory SponsorAd.fromMap(Map<String, dynamic> map) {
    return SponsorAd(
      id: map['id'] as String,
      sponsorName: map['sponsor_name'] as String,
      headline: map['headline'] as String?,
      imageUrl: map['image_url'] as String,
      linkUrl: map['link_url'] as String?,
      weight: (map['weight'] as int?) ?? 1,
    );
  }
}

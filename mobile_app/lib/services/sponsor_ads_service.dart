import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/sponsor_ad.dart';

/// Busca anúncios de patrocinadores para exibição discreta na tela inicial
/// (ver docs/13-patrocinadores.md). Leitura pública — a política
/// `anon_select_active_sponsor_ads` já filtra no banco por `active` e
/// período vigente, então qualquer linha que chegar aqui já está elegível.
class SponsorAdsService {
  final SupabaseClient _client = Supabase.instance.client;

  /// Sorteia UM anúncio dentre os elegíveis, com probabilidade proporcional
  /// ao peso (`weight`) cadastrado no painel. Retorna `null` se não houver
  /// nenhum ativo ou se não houver conectividade — o app nunca deve travar
  /// nem exibir erro por causa disto, é conteúdo secundário.
  Future<SponsorAd?> fetchOne() async {
    try {
      final rows = await _client.from('sponsor_ads').select();
      final ads = (rows as List).map((r) => SponsorAd.fromMap(r as Map<String, dynamic>)).toList();
      if (ads.isEmpty) return null;

      final totalWeight = ads.fold<int>(0, (sum, ad) => sum + ad.weight);
      var pick = Random().nextInt(totalWeight);
      for (final ad in ads) {
        if (pick < ad.weight) return ad;
        pick -= ad.weight;
      }
      return ads.last;
    } catch (_) {
      return null;
    }
  }
}

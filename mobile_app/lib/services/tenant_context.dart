import 'package:flutter/material.dart';

/// Parâmetros de uso da empresa (painel → aba Parâmetros), lidos no login.
class TenantSettings {
  final List<int> validityOptions;
  final int defaultValidityHours;
  final int emergencyDefaultHours;
  final int emergencyMaxHours;
  final bool requireFinalKm;
  final bool allowPartner;
  final Color? brandColor; // cor da marca da empresa (painel → Parâmetros)
  final String? logoUrl; // logo da empresa

  const TenantSettings({
    this.validityOptions = const [4, 8, 12, 24, 48],
    this.defaultValidityHours = 12,
    this.emergencyDefaultHours = 1,
    this.emergencyMaxHours = 6,
    this.requireFinalKm = true,
    this.allowPartner = true,
    this.brandColor,
    this.logoUrl,
  });

  factory TenantSettings.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const TenantSettings();
    const d = TenantSettings();
    final opts = (j['validity_options'] as List?)?.map((e) => (e as num).toInt()).toList();
    final options = (opts == null || opts.isEmpty) ? d.validityOptions : opts;
    var def = (j['default_validity_hours'] as num?)?.toInt() ?? d.defaultValidityHours;
    if (!options.contains(def)) def = options.first;
    return TenantSettings(
      validityOptions: options,
      defaultValidityHours: def,
      emergencyDefaultHours: (j['emergency_default_hours'] as num?)?.toInt() ?? d.emergencyDefaultHours,
      emergencyMaxHours: (j['emergency_max_hours'] as num?)?.toInt() ?? d.emergencyMaxHours,
      requireFinalKm: j['require_final_km'] as bool? ?? d.requireFinalKm,
      allowPartner: j['allow_partner'] as bool? ?? d.allowPartner,
      brandColor: _parseColor(j['brand_color'] as String?),
      logoUrl: j['logo_url'] as String?,
    );
  }
}

Color? _parseColor(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(0xFF000000 | int.parse(hex.substring(1), radix: 16));
}

/// Vínculo "motorista parceiro": o motorista logado pode operar [vehicleId]
/// enquanto [officialDriverCode] estiver com a posse.
class PartnerLink {
  final String vehicleId;
  final String officialDriverCode;
  const PartnerLink(this.vehicleId, this.officialDriverCode);
}

/// Empresa (tenant) da sessão atual. Preenchido pelo DriverSessionService ao
/// entrar/abrir o app; lido pelos serviços que gravam na nuvem (todo insert do
/// app carrega o tenant_id) e pelas telas.
class AppTenant {
  static String? id;
  static String? name;
  static TenantSettings _settings = const TenantSettings();
  static TenantSettings get settings => _settings;
  static set settings(TenantSettings s) {
    _settings = s;
    brand.value = s.brandColor; // o tema do app acompanha a marca da empresa
  }

  /// Cor da marca da empresa em uso (null = padrão do app); o MaterialApp escuta.
  static final ValueNotifier<Color?> brand = ValueNotifier<Color?>(null);
  static List<PartnerLink> partnerLinks = const [];

  static bool isPartnerOf(String vehicleId, String officialCode) =>
      settings.allowPartner &&
      partnerLinks.any((p) => p.vehicleId == vehicleId && p.officialDriverCode == officialCode);
}

/// Parâmetros de uso da empresa (painel → aba Parâmetros), lidos no login.
class TenantSettings {
  final List<int> validityOptions;
  final int defaultValidityHours;
  final int emergencyDefaultHours;
  final int emergencyMaxHours;
  final bool requireFinalKm;
  final bool allowPartner;

  const TenantSettings({
    this.validityOptions = const [4, 8, 12, 24, 48],
    this.defaultValidityHours = 12,
    this.emergencyDefaultHours = 1,
    this.emergencyMaxHours = 6,
    this.requireFinalKm = true,
    this.allowPartner = true,
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
    );
  }
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
  static TenantSettings settings = const TenantSettings();
  static List<PartnerLink> partnerLinks = const [];

  static bool isPartnerOf(String vehicleId, String officialCode) =>
      settings.allowPartner &&
      partnerLinks.any((p) => p.vehicleId == vehicleId && p.officialDriverCode == officialCode);
}

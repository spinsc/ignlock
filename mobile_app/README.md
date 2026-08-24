# IGNLOCK — App do Motorista

App Flutter para liberação de partida veicular: leitura de tag NFC do
painel, autenticação via BLE com o ESP32 do veículo, formulário de
Condutor/KM/Destino, e sincronização offline-first dos logs de viagem com o
backend Supabase (mesmo projeto usado pelo [painel web](../web-dashboard)).

Ver [docs/06-flutter-setup.md](../docs/06-flutter-setup.md) para instalação
do Flutter SDK e passo a passo de build/execução, e o
[README raiz](../README.md) para a visão geral do sistema.

## Notas de build (Android)

- `android/build.gradle.kts` força `compileSdk = 36` em todos os
  subprojetos: o plugin `nfc_manager` (3.5.1) fixa `compileSdkVersion 31`
  no seu próprio `build.gradle`, abaixo do exigido pelas dependências
  transitivas dele (`androidx.fragment` 1.7.1 e outras exigem 34+), o que
  quebra `:nfc_manager:checkDebugAarMetadata`. Revisar esse workaround
  quando o pacote publicar uma correção própria.
- NFC exige um aparelho físico — o emulador Android não simula leitura de
  tags NFC.

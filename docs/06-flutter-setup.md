# Seção C.6 — Instalando o Flutter SDK (Windows) e Rodando o App

O código do app já está pronto em [`mobile_app/`](../mobile_app), conectado
ao backend real (Supabase, projeto `ignlock`). Falta só instalar o Flutter
SDK nesta máquina para compilar/rodar. Passo a passo:

## 1. Baixar e instalar o Flutter SDK

1. Baixe o instalador Windows (zip) em: https://docs.flutter.dev/get-started/install/windows
2. Extraia o `.zip` para um caminho **sem espaços e sem precisar de admin**,
   por exemplo: `C:\src\flutter` (evite `Program Files`).
3. Adicione `C:\src\flutter\bin` ao `PATH` do usuário:
   - Pesquisar Windows → "Editar variáveis de ambiente da conta" → em
     **Variáveis do usuário**, edite `Path` → **Novo** → cole
     `C:\src\flutter\bin` → OK em tudo.
4. Abra um **novo** terminal (PowerShell) e confirme:
   ```powershell
   flutter --version
   ```

## 2. Rodar o diagnóstico

```powershell
flutter doctor
```

Isso lista o que falta. Para o objetivo de "colocar no ar" o app, você
precisa de pelo menos **um** dos dois caminhos abaixo:

### Caminho A — testar em um celular Android físico (mais rápido)
1. No celular: Configurações → Sobre o telefone → toque 7x em "Número da
   versão" para ativar o modo desenvolvedor.
2. Configurações → Opções do desenvolvedor → ative **Depuração USB**.
3. Conecte o celular ao PC via USB e aceite o prompt de autorização no
   celular.
4. `flutter devices` deve listar o aparelho.

### Caminho B — emulador Android no PC
1. Instale o **Android Studio**: https://developer.android.com/studio
2. Abra Android Studio → More Actions → Virtual Device Manager → crie um
   emulador (qualquer Pixel recente, imagem API 34+).
3. `flutter doctor --android-licenses` → aceite todas.

> Nota: como o app usa **NFC**, o emulador não consegue simular a leitura
> real da tag — para testar o fluxo completo (NFC + BLE) você vai precisar
> de um celular físico com NFC e Bluetooth (Caminho A). O emulador serve
> para validar tela, formulário e a integração com o Supabase.

## 3. Instalar as dependências do projeto

```powershell
cd C:\Users\fisca\vehicle-ignition-lock-system\mobile_app
flutter pub get
```

## 4. Rodar o app

```powershell
flutter run
```

Selecione o dispositivo quando solicitado (celular físico ou emulador).

## 5. Gerar o instalável (.apk) para instalar em outros celulares da frota

```powershell
flutter build apk --release
```

O arquivo fica em `mobile_app\build\app\outputs\flutter-apk\app-release.apk`
— copie e instale diretamente nos celulares dos motoristas (ative "instalar
de fontes desconhecidas" no Android, já que não estamos publicando na Play
Store por enquanto).

## 6. Permissões (Android)

Antes do primeiro `flutter run`/`flutter build`, confirme que
`mobile_app/android/app/src/main/AndroidManifest.xml` tem as permissões de
NFC e Bluetooth listadas no [README do projeto](../README.md#permissões-obrigatórias-adicionar-antes-de-compilar-para-produção)
— o `flutter create` (se você gerar a pasta `android/` do zero) não as
inclui automaticamente.

> **Se a pasta `android/` ainda não existe:** rode `flutter create .` dentro
> de `mobile_app/` uma vez — isso gera os projetos nativos Android/iOS ao
> redor do código Dart já existente, sem sobrescrever `lib/` nem
> `pubspec.yaml`.

## Onde o app se conecta

As credenciais do backend já estão em
[`mobile_app/lib/config/supabase_config.dart`](../mobile_app/lib/config/supabase_config.dart)
— é a chave pública (publishable), segura para ficar no app (a segurança
real é feita pelas políticas de RLS no banco, não pela chave).

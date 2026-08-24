/**
 * Web NFC (NDEFReader) só existe no Chrome para Android (site precisa ser
 * https, o que o GitHub Pages já garante). Em qualquer outro navegador
 * (desktop, iOS, Firefox) a gravação não é possível pela web — nesse caso
 * o app mostra o payload para gravação manual com um app como NFC Tools.
 * Ver docs/04-manual.md, Seção D.2.
 */
export function isWebNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

export function vehicleTagPayload(vehicleId: string, bleMac: string): string {
  return `${vehicleId};${bleMac.toUpperCase()}`;
}

// Only one write() pode estar pendente por vez no Android — chamar write()
// de novo enquanto o anterior ainda espera a aproximação da tag derruba o
// primeiro com "Push is cancelled due to a new push request". Abortamos
// explicitamente qualquer gravação anterior antes de iniciar uma nova, para
// que o comportamento seja sempre previsível (nunca duas em paralelo).
let currentWrite: AbortController | null = null;

export async function writeVehicleTag(vehicleId: string, bleMac: string): Promise<void> {
  if (!isWebNfcSupported()) {
    throw new Error('Web NFC não suportado neste navegador (use Chrome no Android).');
  }

  currentWrite?.abort();
  const controller = new AbortController();
  currentWrite = controller;

  try {
    // @ts-expect-error NDEFReader ainda não está nos tipos padrão do TS/DOM.
    const reader = new window.NDEFReader();
    await reader.write(
      { records: [{ recordType: 'text', data: vehicleTagPayload(vehicleId, bleMac) }] },
      { signal: controller.signal }
    );
  } finally {
    if (currentWrite === controller) currentWrite = null;
  }
}

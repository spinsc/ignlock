// Web Bluetooth: mesmo protocolo GATT do app Android/firmware (ver
// firmware/include/config.h). Funciona no Chrome (Android/desktop) e, no iPhone,
// só dentro de um navegador com Web Bluetooth (ex.: Bluefy) — o Safari não tem.

const BASE = '8f6a0001-b5a3-4393-e0a9-e50e24dc';
export const UUID = {
  service: `${BASE}0001`,
  auth: `${BASE}0002`,
  status: `${BASE}0003`,
  config: `${BASE}0004`,
  emergency: `${BASE}0005`,
  control: `${BASE}0006`,
  odo: `${BASE}0007`,
};

export type LockState = 'unlocked' | 'paused' | 'locked' | 'unknown';
export type Status = { state: LockState; driverId: string; remainingSeconds: number };

export function parseStatus(raw: string): Status {
  const p = raw.split('|');
  if (p.length < 3) return { state: 'unknown', driverId: '', remainingSeconds: 0 };
  const state: LockState = p[0] === 'UNLOCKED' ? 'unlocked' : p[0] === 'PAUSED' ? 'paused' : p[0] === 'LOCKED' ? 'locked' : 'unknown';
  return { state, driverId: p[1], remainingSeconds: parseInt(p[2], 10) || 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

export function bleSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as AnyObj).bluetooth;
}

/** Nome anunciado pelo ESP32 a partir do MAC: IGNLOCK-<2 últimos bytes>. */
export function nameFromMac(mac: string): string {
  const p = mac.toUpperCase().split(':');
  return `IGNLOCK-${p[4]}${p[5]}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
const dec = new TextDecoder();

export class VehicleLink {
  private device: AnyObj = null;
  private chars: Record<string, AnyObj> = {};

  get connected(): boolean {
    return !!this.device?.gatt?.connected;
  }
  get name(): string {
    return this.device?.name ?? '';
  }

  /** Abre o seletor Bluetooth (exige toque do usuário) e conecta. */
  async connect(expectedName?: string): Promise<void> {
    if (!bleSupported()) throw new Error('Este navegador não tem Bluetooth Web. No iPhone use o Bluefy; no Android, o Chrome.');
    if (!this.device) {
      const filters = expectedName ? [{ name: expectedName }] : [{ namePrefix: 'IGNLOCK-' }];
      this.device = await (navigator as AnyObj).bluetooth.requestDevice({ filters, optionalServices: [UUID.service] });
    }
    await this.open();
  }

  /** Reconecta ao mesmo veículo (sem novo seletor) se a conexão caiu. */
  async ensure(): Promise<void> {
    if (!this.device) throw new Error('Sem veículo selecionado.');
    if (!this.connected) await this.open();
  }

  private async open(): Promise<void> {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const server = await this.device.gatt.connect();
        const svc = await server.getPrimaryService(UUID.service);
        this.chars = {};
        for (const [key, uuid] of Object.entries(UUID)) {
          if (key === 'service') continue;
          try {
            this.chars[key] = await svc.getCharacteristic(uuid);
          } catch {
            // característica opcional ausente (firmware antigo)
          }
        }
        if (!this.chars.auth || !this.chars.status) throw new Error('Características GATT obrigatórias ausentes.');
        return;
      } catch (e) {
        lastErr = e;
        try { this.device.gatt.disconnect(); } catch { /* ignora */ }
        await sleep(attempt === 1 ? 300 : 1500);
      }
    }
    throw new Error(`Não foi possível conectar ao veículo (Bluetooth). Aproxime-se e tente de novo. (${String((lastErr as Error)?.message ?? lastErr)})`);
  }

  disconnect(): void {
    try { this.device?.gatt?.disconnect(); } catch { /* ignora */ }
  }

  private async write(key: string, text: string): Promise<void> {
    const c = this.chars[key];
    if (!c) throw new Error(key === 'control' ? 'Este veículo está com firmware antigo (sem controle de partida). Atualize o ESP32.' : 'Característica indisponível.');
    const data = enc.encode(text);
    if (c.writeValueWithResponse) await c.writeValueWithResponse(data);
    else await c.writeValue(data);
  }

  private async readText(key: string): Promise<string> {
    const c = this.chars[key];
    if (!c) throw new Error('Característica indisponível.');
    return dec.decode(await c.readValue());
  }

  async status(): Promise<Status> {
    return parseStatus(await this.readText('status'));
  }

  sendAuth(driverId: string, validHours: number, budgetSeconds?: number): Promise<void> {
    const epoch = Math.floor(Date.now() / 1000);
    return this.write('auth', `${driverId}:${validHours}:${epoch}${budgetSeconds ? ':' + budgetSeconds : ''}`);
  }

  sendControl(command: 'PAUSE' | 'RESUME' | 'UNBIND', driverId: string, actingFor?: string): Promise<void> {
    return this.write('control', actingFor ? `${command}:${driverId}:${actingFor}` : `${command}:${driverId}`);
  }

  sendConfig(hours: number, emergencyHours: number, pin: string): Promise<void> {
    return this.write('config', `CONFIG:${hours}:${emergencyHours}:${pin}`);
  }

  sendAdminUnbind(pin: string): Promise<void> {
    return this.write('config', `UNBIND_ADMIN:${pin}`);
  }

  /** Hodômetro (km) lido agora pela OBD-II do ESP32; null se indisponível. */
  async odometerKm(): Promise<number | null> {
    try {
      const raw = await this.readText('odo'); // "ODO:<km*10>" | "ODO:NA"
      const km10 = parseInt(raw.split(':')[1], 10);
      return Number.isFinite(km10) ? Math.round(km10 / 10) : null;
    } catch {
      return null;
    }
  }

  /** Epoch do último acionamento do botão de emergência ainda não confirmado (0 = nenhum). */
  async pendingEmergencyEpoch(): Promise<number> {
    try {
      return parseInt((await this.readText('emergency')).split(':')[1], 10) || 0;
    } catch {
      return 0;
    }
  }

  ackEmergency(): Promise<void> {
    return this.write('emergency', 'ACK');
  }
}

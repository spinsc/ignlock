import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import jsQR from 'jsqr';

/** Lê o QR do veículo pela câmera (no lugar do NFC, que o iPhone não oferece na web). */
export function QrScanner({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        await v.play();
        const loop = () => {
          if (stopped) return;
          const c = canvasRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA && c) {
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, w, h);
              const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
              if (code?.data) {
                stopped = true;
                onResult(code.data);
                return;
              }
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setError('Não consegui abrir a câmera. Permita o acesso à câmera ou envie uma foto do QR.');
      }
    }
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  function fromPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (code?.data) onResult(code.data);
      else setError('Não encontrei um QR nessa foto. Tente de novo, mais de perto.');
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="scan">
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="scan-frame" />
      <p>Aponte a câmera para o QR do veículo.</p>
      {error && <p className="err">{error}</p>}
      <label className="btn ghost">
        Enviar foto do QR
        <input type="file" accept="image/*" capture="environment" onChange={fromPhoto} hidden />
      </label>
      <button className="btn ghost" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

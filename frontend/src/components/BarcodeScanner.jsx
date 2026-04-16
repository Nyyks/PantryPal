import { useEffect, useRef, useState } from 'react';
import { CameraOff, Keyboard, Zap, ZapOff } from 'lucide-react';

export default function BarcodeScanner({ onScan, active = true }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const trackRef = useRef(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const lastScan = useRef('');
  const lastScanTime = useRef(0);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const feedback = () => {
    if (navigator.vibrate) navigator.vibrate(80);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  const handleResult = (text) => {
    const now = Date.now();
    if (text === lastScan.current && now - lastScanTime.current < 2500) return;
    lastScan.current = text;
    lastScanTime.current = now;
    feedback();
    onScanRef.current(text);
  };

  useEffect(() => {
    if (!active || manualInput) {
      if (controlsRef.current) {
        try { controlsRef.current.stop(); } catch {}
        controlsRef.current = null;
      }
      if (trackRef.current) {
        try { trackRef.current.stop(); } catch {}
        trackRef.current = null;
      }
      setScanning(false);
      setTorchSupported(false);
      return;
    }

    let mounted = true;

    async function start() {
      try {
        // @zxing/browser is the modern, browser-optimized API
        const zxingBrowser = await import('@zxing/browser');
        const { BrowserMultiFormatReader } = zxingBrowser;
        const { BarcodeFormat, DecodeHintType } = await import('@zxing/library');

        if (!mounted) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);

        // List video devices and pick rear camera if possible
        let deviceId;
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          // Prefer back/environment camera
          const back = devices.find(d =>
            /back|rear|environment/i.test(d.label)
          );
          deviceId = back?.deviceId || devices[devices.length - 1]?.deviceId;
        } catch {}

        if (!mounted) return;

        const videoEl = videoRef.current;
        if (!videoEl) return;

        // decodeFromVideoDevice: reader picks the camera, handles its lifecycle
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoEl,
          (result, err) => {
            if (!mounted) return;
            if (result) handleResult(result.getText());
            // err is NotFoundException on every frame without a barcode — ignore
          }
        );

        if (!mounted) {
          try { controls.stop(); } catch {}
          return;
        }
        controlsRef.current = controls;

        // Once the stream is running, grab the track for torch + autofocus
        setTimeout(async () => {
          if (!mounted) return;
          const stream = videoEl.srcObject;
          if (stream && stream.getVideoTracks) {
            const track = stream.getVideoTracks()[0];
            trackRef.current = track;
            if (track) {
              const caps = track.getCapabilities?.() || {};
              if (caps.torch) setTorchSupported(true);
              // Apply continuous autofocus + higher resolution if possible
              try {
                const constraints = { advanced: [] };
                if (caps.focusMode?.includes('continuous')) {
                  constraints.advanced.push({ focusMode: 'continuous' });
                }
                if (constraints.advanced.length) {
                  await track.applyConstraints(constraints);
                }
              } catch {}
            }
          }
          setScanning(true);
        }, 300);
      } catch (err) {
        console.error('Scanner error:', err);
        if (mounted) {
          if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
            setError('Camera access denied. Please grant permission in your browser settings.');
          } else if (err.name === 'NotFoundError') {
            setError('No camera found on this device.');
          } else if (err.name === 'NotReadableError') {
            setError('Camera is in use by another application.');
          } else {
            setError(err.message || 'Failed to start camera');
          }
        }
      }
    }

    start();

    return () => {
      mounted = false;
      if (controlsRef.current) {
        try { controlsRef.current.stop(); } catch {}
        controlsRef.current = null;
      }
      if (trackRef.current) {
        try { trackRef.current.stop(); } catch {}
        trackRef.current = null;
      }
    };
  }, [active, manualInput]);

  const toggleTorch = async () => {
    if (!trackRef.current) return;
    try {
      await trackRef.current.applyConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn(!torchOn);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (manualValue.trim()) {
      onScanRef.current(manualValue.trim());
      setManualValue('');
    }
  };

  if (manualInput) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Enter barcode manually</h3>
        <form onSubmit={submitManual} style={{ display: 'flex', gap: 8 }}>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 7610000000000"
            value={manualValue}
            onChange={e => setManualValue(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary">Submit</button>
        </form>
        <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setManualInput(false)}>
          ← Back to camera
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <CameraOff size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>{error}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16 }}>
          Camera requires HTTPS in production. Localhost works for testing.
        </p>
        <button className="btn btn-secondary" onClick={() => setManualInput(true)}>
          <Keyboard size={14} /> Enter barcode manually
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="scanner-container" style={{ position: 'relative', background: '#000' }}>
        <video
          ref={videoRef}
          style={{ width: '100%', display: 'block' }}
          playsInline
          muted
          autoPlay
        />
        {scanning && (
          <>
            {/* Aiming reticle */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '85%', height: '32%', border: '2px solid rgba(108, 127, 216, 0.9)',
              borderRadius: 8, pointerEvents: 'none',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
            }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: '50%',
                height: 2, background: 'rgba(108, 127, 216, 0.9)',
                boxShadow: '0 0 8px rgba(108, 127, 216, 0.8)',
              }} />
            </div>
            {/* Torch button */}
            {torchSupported && (
              <button
                onClick={toggleTorch}
                style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: torchOn ? 'rgba(224, 148, 58, 0.9)' : 'rgba(0,0,0,0.6)',
                  color: '#fff', border: 'none', borderRadius: 999,
                  padding: 10, cursor: 'pointer', display: 'flex',
                }}
              >
                {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
              </button>
            )}
          </>
        )}
        {!scanning && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '60px', gap: 8, color: 'var(--text-muted)',
            position: 'absolute', inset: 0, background: 'var(--bg-card)',
          }}>
            <div className="spinner" />
            <span style={{ fontSize: 13 }}>Starting camera...</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setManualInput(true)}>
          <Keyboard size={12} /> Enter manually
        </button>
      </div>
    </div>
  );
}

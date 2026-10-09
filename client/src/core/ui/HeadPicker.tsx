import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  centredFraming,
  cutOutPerson,
  exportHead,
  loadPhoto,
  personFraming,
  renderHead,
} from '../media/head-cutout.ts';
import type { Cutout, Framing } from '../media/head-cutout.ts';
import styles from './HeadPicker.module.css';

const PREVIEW_SIZE = 360;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type Step =
  | { kind: 'idle' }
  | { kind: 'working' }
  | {
      kind: 'editing';
      photo: HTMLCanvasElement;
      /** null when the cut-out failed: only the photo as it is can be used. */
      cutout: Cutout | null;
    };

interface Props {
  /** Size limit of the PNG sent. */
  maxBytes: number;
  /** Label of the button that sends the head. */
  submitLabel: string;
  /** Sends the PNG; the picker only shows the message of a refusal. */
  onSubmit(png: Blob): Promise<{ ok: true } | { ok: false; message: string }>;
}

/**
 * Takes a photo, removes its background in the browser (nothing leaves the device before the
 * player validates), lets them frame the head, and gives a square PNG.
 */
export function HeadPicker({ maxBytes, submitLabel, onSubmit }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [keepPhoto, setKeepPhoto] = useState(false);
  const [framing, setFraming] = useState<Framing | null>(null);
  const [zoomBase, setZoomBase] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; framing: Framing } | null>(null);

  const source =
    step.kind === 'editing' ? (keepPhoto || !step.cutout ? step.photo : step.cutout.person) : null;

  const startEditing = useCallback((photo: HTMLCanvasElement, cutout: Cutout | null) => {
    const start = cutout ? personFraming(cutout.bounds) : centredFraming(photo);
    setStep({ kind: 'editing', photo, cutout });
    setKeepPhoto(!cutout);
    setFraming(start);
    setZoomBase(start.side);
    setZoom(1);
  }, []);

  async function choose(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (!file.type.startsWith('image/') || file.size > MAX_FILE_BYTES) {
      setMessage('Choisis une image (JPEG, PNG ou WebP) de moins de 20 Mo.');
      return;
    }
    setStep({ kind: 'working' });
    let photo: HTMLCanvasElement;
    try {
      photo = await loadPhoto(file);
    } catch {
      setStep({ kind: 'idle' });
      setMessage('Cette image est illisible.');
      return;
    }
    try {
      startEditing(photo, await cutOutPerson(photo));
    } catch {
      startEditing(photo, null);
      setMessage('Le détourage automatique a échoué : ta photo sera utilisée telle quelle.');
    }
  }

  // Redraws the preview whenever the framing or the version of the picture changes.
  useEffect(() => {
    if (!source || !framing || !preview.current) return;
    const rendered = renderHead(source, framing, PREVIEW_SIZE * 2);
    const context = preview.current.getContext('2d')!;
    context.clearRect(0, 0, rendered.width, rendered.height);
    context.drawImage(rendered, 0, 0);
  }, [source, framing]);

  function changeZoom(value: number) {
    setZoom(value);
    setFraming((current) => (current ? { ...current, side: zoomBase / value } : current));
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!framing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, framing };
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start) return;
    const ratio = start.framing.side / event.currentTarget.clientWidth;
    setFraming({
      ...start.framing,
      cx: start.framing.cx - (event.clientX - start.x) * ratio,
      cy: start.framing.cy - (event.clientY - start.y) * ratio,
    });
  }

  async function submit() {
    if (!source || !framing) return;
    setSending(true);
    setMessage(null);
    try {
      const png = await exportHead(source, framing, maxBytes);
      const result = await onSubmit(png);
      if (!result.ok) setMessage(result.message);
    } catch {
      setMessage("Impossible de préparer l'image. Essaie avec une autre photo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.picker}>
      {step.kind === 'editing' && framing ? (
        <>
          <canvas
            ref={preview}
            className={styles.preview}
            width={PREVIEW_SIZE * 2}
            height={PREVIEW_SIZE * 2}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            aria-label="Aperçu de ta tête : glisse pour la déplacer"
          />
          <label className={styles.zoom}>
            Zoom
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
            />
          </label>
          {step.cutout && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={keepPhoto}
                onChange={(event) => {
                  setKeepPhoto(event.target.checked);
                  // The framing suited to the other version of the picture.
                  const next = event.target.checked
                    ? centredFraming(step.photo)
                    : personFraming(step.cutout!.bounds);
                  setFraming(next);
                  setZoomBase(next.side);
                  setZoom(1);
                }}
              />
              Garder la photo telle quelle (sans détourage)
            </label>
          )}
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" disabled={sending} onClick={submit}>
              {sending ? 'Envoi…' : submitLabel}
            </button>
            <label className="btn">
              Changer de photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => void choose(event.target.files?.[0])}
              />
            </label>
          </div>
        </>
      ) : (
        <label className={`btn btn-primary ${styles.choose}`} aria-busy={step.kind === 'working'}>
          {step.kind === 'working' ? 'Détourage en cours…' : 'Choisir une photo de ma tête'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={step.kind === 'working'}
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </label>
      )}
      {message && (
        <p role="alert" className={styles.message}>
          {message}
        </p>
      )}
    </div>
  );
}

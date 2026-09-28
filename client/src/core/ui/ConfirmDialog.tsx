import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation, shown as soon as it is rendered. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
    >
      <h2 id="confirm-title">{props.title}</h2>
      <p className={styles.message}>{props.message}</p>
      <div className={styles.actions}>
        <button type="button" className="btn" onClick={props.onCancel} autoFocus>
          Annuler
        </button>
        <button
          type="button"
          className={props.danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

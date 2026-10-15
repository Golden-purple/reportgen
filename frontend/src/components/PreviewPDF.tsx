import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

type PreviewPDFProps = {
  pdfUrl: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

function PreviewPDF({ pdfUrl, onClose, returnFocusRef }: PreviewPDFProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusButton = returnFocusRef.current;
    dialog?.showModal();
    closeButtonRef.current?.focus();

    return () => {
      dialog?.close();
      returnFocusButton?.focus();
    };
  }, [returnFocusRef]);

  return (
    <dialog
      className="pdf-dialog"
      ref={dialogRef}
      aria-labelledby="pdf-dialog-title"
      aria-describedby="pdf-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="pdf-dialog__header">
        <div className="pdf-dialog__heading">
          <h2 id="pdf-dialog-title">Report ready</h2>
          <p id="pdf-dialog-description">Review your PDF, then save a copy.</p>
        </div>
        <div className="pdf-dialog__actions">
          <a className="pdf-download" href={pdfUrl} download="generated_report.pdf">Download PDF</a>
          <button className="pdf-close" ref={closeButtonRef} type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <iframe className="pdf-frame" src={pdfUrl} title="Generated report PDF preview" />
      <p className="pdf-dialog__fallback">Preview blank? Download the PDF and open it in your PDF viewer.</p>
    </dialog>
  );
}

export default PreviewPDF;

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import PreviewPDF from './PreviewPDF.tsx';

type UploadStatus = 'idle' | 'processing' | 'ready' | 'error';

function buildFormData(files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  return formData;
}

function Upload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const processingRef = useRef(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = processingRef.current ? 'none' : 'copy';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!processingRef.current) {
      void uploadFiles(Array.from(event.dataTransfer.files));
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset the input so choosing the same files again can retry a failed request.
    event.target.value = '';
    void uploadFiles(files);
  }

  async function uploadFiles(files: File[]) {
    if (processingRef.current || files.length === 0) return;
    processingRef.current = true;
    setFileCount(files.length);
    setStatus('processing');
    setErrorMessage(null);
    setPdfUrl(null);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: buildFormData(files),
      });

      if (!res.ok) {
        let message = `Upload failed (HTTP ${res.status}). Please try again.`;
        if (res.headers.get('content-type')?.includes('application/json')) {
          const errorBody: { message?: string } = await res.json();
          message = errorBody.message ?? message;
        }
        throw new Error(message);
      }

      const pdfBin = await res.blob();
      setPdfUrl(URL.createObjectURL(pdfBin));
      setStatus('ready');
    } catch (error) {
      console.error('Upload failed:', error);
      setErrorMessage(
        error instanceof TypeError
          ? 'Could not reach the report generator. Check that the backend is running and try again.'
          : error instanceof Error
            ? error.message
            : 'Could not generate the report. Please try again.',
      );
      setStatus('error');
    } finally {
      processingRef.current = false;
    }
  }

  return (
    <div className="upload-container">
      <button
        className="upload-button"
        ref={uploadButtonRef}
        type="button"
        disabled={status === 'processing'}
        onClick={() => fileInputRef.current?.click()}
      >
        {status === 'processing' ? 'Generating report…' : 'Upload from device'}
      </button>

      <input
        hidden
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        multiple
        accept=".py,.cpp,.c"
      />

      <p className="upload-separator">or</p>

      <div
        className="dragNdrop"
        data-busy={status === 'processing'}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <strong>Drop your source files here</strong>
        <span>Python, C, or C++ · up to 7 files · 1 MB each</span>
      </div>

      {status === 'processing' && (
        <div className="upload-status" role="status" aria-live="polite">
          <span className="upload-status__indicator" aria-hidden="true" />
          <span>Uploading {fileCount} {fileCount === 1 ? 'file' : 'files'} and generating your PDF. This can take a moment.</span>
        </div>
      )}

      {status === 'error' && errorMessage && (
        <p className="upload-error" role="alert">{errorMessage}</p>
      )}

      {status === 'ready' && pdfUrl && (
        <PreviewPDF pdfUrl={pdfUrl} onClose={() => setPdfUrl(null)} returnFocusRef={uploadButtonRef} />
      )}
    </div>
  );
}

export default Upload;

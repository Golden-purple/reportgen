type prvTypes = {
  pdfUrl: string;
  onClose: () => void;
};

function PreviewPDF({ pdfUrl, onClose }: prvTypes) {
  return (
    <div className="pdf-overlay">
      
      <section className="pdf-dialog" role="dialog" aria-modal="true" aria-label="Generated report preview">

        <button type="button" onClick={onClose}>Close</button>
        <iframe src={pdfUrl} title="Generated report" />
        <a href={pdfUrl} download="generated_report.pdf">
          Download PDF
        </a>

      </section>
    
    </div>
  );
}

export default PreviewPDF
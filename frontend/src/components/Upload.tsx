import React from 'react'
import { useRef } from 'react'

function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();     
  // by default the browser will not allow dropping elements into a div, so we need to prevent the default behavior
}

function handleDrop(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();
  const files = event.dataTransfer.files;
  alert(`Dropped ${files.length} file(s): ${Array.from(files).map(file => file.name).join(', ')}`);
  // Handle dropped files here 
  // Default: giving input as file directly gives file list, but drag and drop gives a dataTransfer object which contains the files
}

const Upload = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-container">
        <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
          Upload from device
        </button>

        <input hidden type="file" ref={fileInputRef} multiple accept=".py, .cpp, .c"/>

        <p>Or</p>

        <div className="dragNdrop" onDragOver={handleDragOver} onDrop={handleDrop}>
          Drag and Drop all files here
        </div>

    </div>
  )
}

export default Upload
import React from 'react'
import { useRef } from 'react'

function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();     
  // by default the browser will not allow dropping elements into a div, so we need to prevent the default behavior
}

function buildFormData(files: FileList){
  const formData = new FormData();
  for(const file of files){
    formData.append("files", file);
  }
  for(const [fieldName, value] of formData.entries()){
    console.log(fieldName, value);
  } 
  return formData;
}

function handleDrop(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault();
  const files = event.dataTransfer.files;
  // alert(`Dropped ${files.length} file(s): ${Array.from(files).map(file => file.name).join(', ')}`);
  // Handle dropped files here above.
  // Default: giving input as file directly gives file list, but drag and drop gives a dataTransfer object which contains the files
  if(files && files.length > 0){
    uploadFiles(files);
  }
}

function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
  const files = event.target.files;
  if (files && files.length > 0) {
    // alert(`Selected ${files.length} file(s): ${Array.from(files).map(file => file.name).join(', ')}`);
    uploadFiles(files);
  }
}

async function uploadFiles(files: FileList) {
    try {
        const formData = buildFormData(files);
        const res = await fetch("/api/upload", {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
          let message = `Upload failed HTTP ${res.status}`;
          const contentType = res.headers.get("content-type");

          if (contentType?.includes("application/json")) {
            const errorBody = await res.json();
            message = errorBody.message ?? message;
          }
          throw new Error(message);
        }

        const result = await res.json();
        console.log("Backend response:", result);
    } 
    catch (error) {
        console.error("Upload failed:", error);
    }
}

const Upload = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="upload-container">
        <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
          Upload from device
        </button>

        <input hidden type="file" ref={fileInputRef} onChange={handleChange} multiple accept=".py, .cpp, .c"/>

        <p>Or</p>

        <div className="dragNdrop" onDragOver={handleDragOver} onDrop={handleDrop}>
          Drag and Drop all files here
        </div>

    </div>
  )
}

export default Upload
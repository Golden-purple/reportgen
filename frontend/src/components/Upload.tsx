import React from 'react'

const Upload = () => {
  return (
    <div className="upload-container">
        <button className="upload-button">Upload from device</button>
        <p>Or</p>
        <div className="dragNdrop">
          Drag and Drop files here
        </div>
    </div>
  )
}

export default Upload
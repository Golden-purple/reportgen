import React from 'react'
import Upload from './components/Upload.tsx'

function Header(){
  return (
    <header className="header">
      <div className="header-content">

        <h1 className="name">reportgen</h1>
        <a className="github-link" href="https://github.com/Golden-purple/reportgen/" target="_blank" rel="noopener noreferrer" aria-label="View reportgen on GitHub">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.678-.217.678-.483 0-.237-.008-.867-.013-1.7-2.782.6-3.369-1.34-3.369-1.34-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.899 1.53 2.345 1.095 2 .775.05-.6.311-1.033.607-1.27-2.278-.26-4.678-1.14-4.678-5.07 0-1.12.39-2.03 1.03-2.75.1-.26-.45-1.3.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.34.2 2.38.1 2.64.64.72.65.92.65 1.85 0 1.33-.01 2.4-.01 2.73 0 .27.18.58.69.48A10.012 10.012 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
          </svg>
        </a>

      </div>
    </header>
  )
}

function Main() {
  return  (
    <>
      <main className="main">
        <section className="hero">
          <div className="container">
            <h2>Generate reports from your program files.</h2>

            <p>
              Upload your assignments and generate a .md / PDF report automatically.
            </p>
            <p className="technical">
              For .py, .cpp, .c files. (.cpp and .c files may be executed with OpenMP.)
            </p>
            <p className="notif">
              Support for MPI coming later.
            </p>
          </div>
        </section>  

        <section className="upload-section">
          <Upload />
        </section>
        
      </main>
    </>
  )
}

const App = () => {
  return (
    <>
      <Header />
      <Main />
      
    </>
  )
}

export default App
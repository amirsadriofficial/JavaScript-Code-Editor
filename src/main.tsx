import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorShell } from './ui/EditorShell'
import './styles/editor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorShell />
  </StrictMode>,
)

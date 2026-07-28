import { Navigate, Route, Routes } from 'react-router-dom'
import { TotemPage } from '@/features/totem/TotemPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TotemPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

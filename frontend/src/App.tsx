 
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import BrowsePage from './pages/BrowsePage'
import ImageDetailPage from './pages/ImageDetailPage'
import TagsPage from './pages/TagsPage'
import CategoriesPage from './pages/CategoriesPage'
import JobsPage from './pages/JobsPage'
import SettingsPage from './pages/SettingsPage'
import RandomPage from './pages/RandomPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/browse" replace />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/image/:id" element={<ImageDetailPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/random" element={<RandomPage />} />
      </Routes>
    </Layout>
  )
}

export default App

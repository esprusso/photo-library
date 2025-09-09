 
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import BrowsePage from './pages/BrowsePage'
import ImageDetailPage from './pages/ImageDetailPage'
import TagsPage from './pages/TagsPage'
import CategoriesPage from './pages/CategoriesPage'
import ClipsPage from './pages/ClipsPage'
import ClipCategoriesPage from './pages/ClipCategoriesPage'
import JobsPage from './pages/JobsPage'
import SettingsPage from './pages/SettingsPage'
import RandomPage from './pages/RandomPage'
import RandomClipPage from './pages/RandomClipPage'
import RandomUnratedPage from './pages/RandomUnratedPage'
import DuplicatesPage from './pages/DuplicatesPage'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/browse" replace />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/image/:id" element={<ImageDetailPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/clips" element={<ClipsPage />} />
        <Route path="/clip-categories" element={<ClipCategoriesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/random" element={<RandomPage />} />
        <Route path="/random-clip" element={<RandomClipPage />} />
        <Route path="/random-unrated" element={<RandomUnratedPage />} />
        <Route path="/duplicates" element={<DuplicatesPage />} />
      </Routes>
    </Layout>
  )
}

export default App

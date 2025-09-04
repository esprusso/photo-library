 
import { useParams } from 'react-router-dom'

export default function ImageDetailPage() {
  const { id } = useParams()
  return (
    <div className="p-6">
      <div className="text-gray-700 dark:text-gray-200">Image detail placeholder for ID {id}</div>
    </div>
  )
}

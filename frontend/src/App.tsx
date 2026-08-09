import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Landing } from './pages/Landing'
import { MyEngagements } from './pages/MyEngagements'
import { CreateEngagement } from './pages/CreateEngagement'
import { EngagementDetail } from './pages/EngagementDetail'
import { Docs } from './pages/Docs'
import { Stats } from './pages/Stats'
import { Profile } from './pages/Profile'
import { Templates } from './pages/Templates'
import { Notifications } from './pages/Notifications'
import { Milestones } from './pages/Milestones'
import { Negotiate } from './pages/Negotiate'
import { NotFound } from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      {/* Marketing page: its own minimal header, no app sidebar */}
      <Route path="/" element={<Landing />} />
      {/* App + docs pages: wrapped in the sidebar shell */}
      <Route element={<Layout />}>
        <Route path="/app" element={<MyEngagements />} />
        <Route path="/app/create" element={<CreateEngagement />} />
        <Route path="/app/engagement/:id" element={<EngagementDetail />} />
        <Route path="/app/profile/:address" element={<Profile />} />
        <Route path="/app/templates" element={<Templates />} />
        <Route path="/app/notifications" element={<Notifications />} />
        <Route path="/app/milestones" element={<Milestones />} />
        <Route path="/app/negotiate" element={<Negotiate />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/stats" element={<Stats />} />
        {/* Catch-all: any unmatched path still gets sidebar nav to recover */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

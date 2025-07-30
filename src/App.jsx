import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ClientProvider } from '@/contexts/ClientContext';
import Layout from '@/pages/Layout.jsx';
import Login from '@/pages/Login.jsx';
import Register from '@/pages/Register.jsx';
import Dashboard from '@/pages/Dashboard.jsx';
import Users from '@/pages/users.jsx';
import Chat from '@/pages/Chat.jsx';
import DataGenerator from '@/pages/DataGenerator.jsx';
import NutritionPlan from '@/pages/NutritionPlan.jsx';
import '@/styles/rtl.css';
import MenuCreate from './pages/MenuCreate.jsx';
import MenuLoad from './pages/MenuLoad.jsx';
import RecipesPage from './pages/RecipesPage.jsx';
import UserWeightLogs from './pages/UserWeightLogs.jsx';

// Protected Route component
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// Public Route component (redirects to dashboard if already logged in)
function PublicRoute({ children }) {
  const { user } = useAuth();
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <LanguageProvider>
          <ClientProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              } />
              
              {/* Root redirect to login */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              
              {/* Protected Routes - All wrapped in Layout */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="users" element={<Users />} />
                <Route path="chat" element={<Chat />} />
                <Route path="data-generator" element={<DataGenerator />} />
                <Route path="nutrition-plan" element={<NutritionPlan />} />
                <Route path="MenuCreate" element={<MenuCreate />} />
                <Route path="MenuLoad" element={<MenuLoad />} />
                <Route path="menuload" element={<Navigate to="/MenuLoad" replace />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="weight-logs" element={<UserWeightLogs />} />
              </Route>
            </Routes>
          </ClientProvider>
        </LanguageProvider>
      </AuthProvider>
    </Router>
  );
}

export default App; 
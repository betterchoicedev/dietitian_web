import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import Layout from '@/pages/Layout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Users from '@/pages/Users';
import Chat from '@/pages/Chat';
import DataGenerator from '@/pages/DataGenerator';
import NutritionPlan from '@/pages/NutritionPlan';
import '@/styles/rtl.css';
import MenuCreate from './pages/MenuCreate';
import MenuLoad from './pages/MenuLoad';
import RecipesPage from './pages/RecipesPage';

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
            </Route>
          </Routes>
        </LanguageProvider>
      </AuthProvider>
    </Router>
  );
}

export default App; 
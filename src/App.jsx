import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import './index.css';

// Lazy load components (or import directly for smaller MVPs)
import CustomerApp from './pages/CustomerApp';
import AdminDashboard from './pages/AdminDashboard';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';

function PaymentSuccess() {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);
  
  useEffect(() => {
    const verifyPayment = async () => {
      // Check for reference in URL
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('reference');
      
      if (ref) {
        // Update all pending orders to paid for this user
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('orders')
            .update({ status: 'paid', payment_verified: true })
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .eq('payment_method', 'Paystack');
        }
        setVerified(true);
      }
    };
    verifyPayment();
  }, []);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50">
      <div className="text-center p-8">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">
          {verified ? 'Payment Verified!' : 'Payment Successful!'}
        </h1>
        <p className="text-slate-600 mb-6">Your order is being prepared for delivery.</p>
        <button 
          onClick={() => {
            navigate('/menu');
          }} 
          className="inline-block bg-orange-600 text-white px-6 py-3 rounded-full font-bold"
        >
          View My Orders
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-[#0f172a] text-white">Loading system...</div>;
  }

  // Guard for Admin Routes
  const ProtectedRoute = ({ children, requireAdmin = false }) => {
    if (!session) return <Navigate to="/login" replace />;
    if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/" replace />;
    return children;
  };

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<AuthPage session={session} />} />

        {/* Landing Page */}
        <Route path="/" element={<LandingPage session={session} />} />

        {/* Customer Menu/Ordering */}
        <Route path="/menu" element={<CustomerApp session={session} />} />
        <Route path="/payment-success" element={<PaymentSuccess />} />

        {/* Admin Dashboard */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requireAdmin={true}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

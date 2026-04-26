import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Star, Utensils, Clock, Truck } from "lucide-react";

export default function LandingPage({ session }) {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* Background blobs in CSS */}
      <div className="blob-1"></div>
      <div className="blob-2"></div>

      <nav className="nav premium-glass">
        <div className="container flex justify-between items-center py-4">
<h1 className="logo">
              OASISLOUNGE<span className="nav-sub"> Restaurant & Bar</span>
            </h1>
          <div className="nav-actions flex items-center gap-4">
            {!session && (
              <button
                onClick={() => navigate("/login")}
                className="btn btn-surface"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => navigate("/menu")}
              className="btn btn-primary"
            >
              Start Order
            </button>
          </div>
        </div>
      </nav>

      <main className="hero container text-center fade-in">
        <div className="hero-badge badge">Now Active In Your City</div>
        <h1 className="hero-title">
          Gourmet Comfort <br />{" "}
          <span className="text-gradient">Redefined.</span>
        </h1>
        <p className="hero-subtext">
          Discover curated elite culinary delights, delivered to your doorstep.
        </p>

        <div className="hero-btns flex justify-center gap-4 mt-4">
          <button
            onClick={() => navigate("/menu")}
            className="btn btn-primary btn-lg"
          >
            Explore Menu <ArrowRight style={{ marginLeft: "8px" }} />
          </button>
        </div>

        <div className="hero-visual mt-8">
          <div className="hero-image-container">
            <img
              src="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
              alt="Premium Dish"
            />
          </div>
        </div>
      </main>

      <section className="features container py-8 mt-4">
        <div className="feature-grid">
          <div className="premium-card">
            <Utensils className="feature-icon" />
            <h3>Chef Crafted</h3>
            <p>Fresh premium ingredients only.</p>
          </div>
          <div className="premium-card">
            <Clock className="feature-icon" />
            <h3>Quick Prep</h3>
            <p>Ready in 25 minutes or less.</p>
          </div>
          <div className="premium-card">
            <Truck className="feature-icon" />
            <h3>Hot Delivery</h3>
            <p>Specialized thermal packaging.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

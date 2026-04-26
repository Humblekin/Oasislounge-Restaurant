import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  ShoppingBag,
  LogOut,
  Search,
  User,
  Package,
  ChevronRight,
  X,
  Phone,
  MapPin,
  CreditCard,
  CheckCircle,
  Minus,
  Plus,
  Sparkles,
  UtensilsCrossed,
  Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Chatbot from "../components/Chatbot";

export default function CustomerApp({ session }) {
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Paystack");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeView, setActiveView] = useState("menu");
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    fetchMenu();
    if (session) {
      fetchOrders();
    }

    const handleRefresh = () => fetchOrders();
    window.addEventListener("refresh_orders", handleRefresh);
    return () => window.removeEventListener("refresh_orders", handleRefresh);
  }, [session]);

  const fetchMenu = async () => {
    try {
      let { data, error } = await supabase
        .from("menu_items")
        .select("*");
      
      if (!data || data.length === 0) {
        await supabase.from("menu_items").insert([
          { name: 'Jollof Rice', price: 15, description: 'Classic Ghanaian jollof rice', available: true },
          { name: 'Waakye', price: 10, description: 'Rice and beans with shrimps', available: true },
          { name: 'Burger', price: 30, description: 'Double beef burger', available: true }
        ]);
        const result = await supabase.from("menu_items").select("*");
        data = result.data;
      }
      
      const availableItems = data.filter(item => item.available !== false);
      setMenuItems(availableItems || []);
    } catch (err) {
      console.error("Menu error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (!error) setOrders(data || []);
  };

  const cancelOrder = async (id) => {
    if (window.confirm("Are you sure you want to cancel this order?")) {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", id)
        .eq("status", "pending");
      if (error) alert("Could not cancel: " + error.message);
      else fetchOrders();
    }
  };

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });

    const icon = document.getElementById("cart-icon-main");
    if (icon) {
      icon.classList.add("vibrate");
      setTimeout(() => icon.classList.remove("vibrate"), 300);
    }
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) => {
      const updated = prev.map((item) => {
        if (item.id === id) {
          const newQty = (item.quantity || 1) + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item !== null);
      return updated;
    });
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const saveOrderOnly = async () => {
    if (!session) { navigate("/login"); return; }
    if (cart.length === 0) { alert("Your tray is empty"); return; }
    if (!fullName.trim()) { alert("Please enter your name"); return; }
    if (!phone.trim()) { alert("Please enter your phone"); return; }
    if (!address.trim()) { alert("Please enter delivery location"); return; }

    const orderData = {
      user_id: session?.user?.id,
      items: cart,
      total: cartTotal,
      status: "pending",
      full_name: fullName,
      phone: phone,
      address: address,
      payment_method: paymentMethod,
    };

    const { error } = await supabase.from("orders").insert(orderData);
    if (error) { alert("Error: " + error.message); return; }
    setCart([]); localStorage.removeItem('cart'); setShowCart(false); setFullName(""); setPhone(""); setAddress("");
    fetchOrders(); setActiveView("orders");
    alert("Order placed! Pay on delivery.");
  };

  const saveOrderOnlyWithPayment = async () => {
    if (!session) { navigate("/login"); return; }
    if (cart.length === 0) { alert("Tray empty"); return; }
    if (!fullName.trim() || !phone.trim() || !address.trim()) { alert("Fill delivery details"); return; }
    
    const ref = 'OASIS_' + Date.now();
    const amount = Math.round(cartTotal) * 100;
    const email = session?.user?.email || 'customer@oasislounge.com';
    
    try {
      const orderData = {
        user_id: session?.user?.id,
        items: cart,
        total: cartTotal,
        status: "pending",
        full_name: fullName,
        phone: phone,
        address: address,
        payment_method: 'Paystack'
      };
      
      const { error } = await supabase.from("orders").insert(orderData);
      if (error) {
        alert("Order error: " + error.message);
        return;
      }
      
      const callbackUrl = encodeURIComponent(window.location.origin + '/payment-success?reference=' + ref);
      const checkoutUrl = `https://checkout.paystack.co/${ref}?amount=${amount}&email=${encodeURIComponent(email)}&callback_url=${callbackUrl}`;
      
      window.location.href = checkoutUrl;
    } catch (e) {
      alert("Payment error. Try Pay Later.");
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const filteredMenu = menuItems.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    "All",
    ...new Set(menuItems.map((item) => item.category || "Specialty")),
  ];

  return (
    <div className="customer-app bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="header premium-glass sticky top-0 z-100">
        <div className="container flex justify-between items-center">
          <h1 className="logo cursor-pointer" onClick={() => navigate("/")}>
            OASIS<span className="header-logo-full"> Restaurant & Bar</span>
          </h1>

          <div className="flex items-center gap-3">
            <button
              id="cart-icon-main"
              className="cart-jewel group relative"
              onClick={() => setShowCart(true)}
            >
              <ShoppingBag size={20} />
              {cart.length > 0 && (
                <span className="cart-badge-anim">{cart.length}</span>
              )}
            </button>

            {session ? (
              <>
                <button
                  onClick={() => setActiveView(activeView === "menu" ? "orders" : "menu")}
                  className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg cursor-pointer hover:bg-orange-600 transition-all"
                  title={activeView === "menu" ? "View Orders" : "Back to Menu"}
                >
                  {activeView === "menu" ? (
                    <User size={18} />
                  ) : (
                    <UtensilsCrossed size={18} />
                  )}
                </button>
                <button onClick={logout} className="hidden md:flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase bg-rose-50 border border-rose-100 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                  <LogOut size={14} />
                  Sign Out
                </button>
                <button onClick={logout} className="md:hidden w-10 h-10 flex items-center justify-center bg-rose-50 border border-rose-100 rounded-xl text-rose-500">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="join-us-btn"
              >
                Join Us
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container">
        {activeView === "menu" ? (
          <>
            {/* Hero Section */}
            <div className="hero-section text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-full text-orange-600 text-xs font-black uppercase tracking-widest mb-4 border border-orange-100">
                <Sparkles size={12} /> Fresh Today
              </div>
              <h2 className="text-2xl md:text-5xl font-black mb-4 tracking-tight leading-tight">
                Choose Your <span className="text-primary italic">Gourmet</span> Menu.
              </h2>
              <p className="text-slate-400 max-w-md mx-auto font-medium text-sm md:text-base">
                Curated dishes crafted with the finest ingredients.
              </p>
            </div>

            {/* Category Pills */}
            <div className="category-pills mb-6">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`pill ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Grid */}
            {loading ? (
              <div className="loading-grid">
                <div className="spinner-pro"></div>
                <p className="text-slate-400 font-bold italic">Curating for you...</p>
              </div>
            ) : (
              <div className="menu-grid">
                {filteredMenu.map((item) => (
                  <div key={item.id} className="gourmet-card group">
                    <div className="card-image-wrapper">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} loading="lazy" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <UtensilsCrossed size={40} strokeWidth={1} />
                        </div>
                      )}
                      <div className="price-tag">₵{item.price}</div>
                    </div>

                    <div className="card-content">
                      <span className="card-category">
                        {item.category || "Chef's Choice"}
                      </span>
                      <h3 className="card-title">{item.name}</h3>
                      <p className="card-description">
                        {item.description || "A masterpiece of taste."}
                      </p>
                      <button onClick={() => addToCart(item)} className="add-btn">
                        <Plus size={16} /> Add to Tray
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Orders View */
          <section className="orders-history">
            <div className="section-header">
              <div>
                <h2 className="text-xl md:text-3xl font-black">Your Orders</h2>
                <p className="text-xs font-black uppercase text-slate-400 tracking-widest mt-1">
                  Monitor your gourmet orders
                </p>
              </div>
              <button
                onClick={() => setActiveView("menu")}
                className="btn-surface text-xs py-2 px-4 rounded-full"
              >
                Back to Menu
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center gap-4 opacity-30">
                <Package size={48} strokeWidth={1} />
                <p className="font-bold text-slate-400">No orders yet.</p>
                <button onClick={() => setActiveView("menu")} className="btn-pro px-6 py-2">
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="orders-grid">
                {orders.map((order) => (
                  <div key={order.id} className="order-card">
                    <div className="order-card-header">
                      <div className={`order-card-icon ${order.status === 'delivered' ? 'delivered' : ''}`}>
                        {order.status === "delivered" ? <CheckCircle size={18} /> : <Clock size={18} />}
                      </div>
                      <span className={`status-pill-pro ${order.status}`}>{order.status}</span>
                    </div>

                    <h4 className="font-bold text-base mb-2">{order.items.map((i) => i.name).join(", ")}</h4>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-4">
                      #{order.id.slice(0, 8)} • {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>

                    <div className="order-card-footer">
                      <span className="text-xl font-black">₵{order.total}</span>
                      {order.status === "pending" && (
                        <button onClick={() => cancelOrder(order.id)} className="order-cancel-btn">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Cart Drawer */}
      {showCart && (
        <div className="cart-drawer-overlay">
          <div className="cart-backdrop" onClick={() => setShowCart(false)}></div>
          <aside className="cart-drawer">
            <div className="drawer-header">
              <h3 className="text-2xl font-black">Your Tray<span>.</span></h3>
              <button onClick={() => setShowCart(false)} className="cart-close">
                <X size={20} />
              </button>
            </div>

            <div className="drawer-content">
              {cart.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                  <ShoppingBag size={48} strokeWidth={1} />
                  <p className="font-bold text-slate-400">Your tray is empty.</p>
                  {session && (
                    <button onClick={logout} className="flex items-center gap-2 text-sm text-rose-500 hover:text-rose-700">
                      <LogOut size={16} /> Sign Out
                    </button>
                  )}
                  <button onClick={() => setShowCart(false)} className="btn-pro">Start Adding</button>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map((item) => (
                    <div key={item.id} className="cart-item-card">
                      <div className="cart-item-img">
                        {item.image_url ? <img src={item.image_url} alt={item.name} /> : <Package size={20} className="text-slate-200" />}
                      </div>
                      <div className="cart-item-info">
                        <h4 className="name">{item.name}</h4>
                        <p className="price">₵{item.price}</p>
                      </div>
                      <div className="qty-controls">
                        <button onClick={() => updateQuantity(item.id, -1)} className="qty-btn"><Minus size={12} /></button>
                        <span className="qty-val">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="qty-btn"><Plus size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="drawer-footer">
                <div className="field-group">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Full Name</label>
                  <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-100 outline-none" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>

                <div className="field-group">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Phone</label>
                  <input type="tel" className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-100 outline-none" placeholder="0245123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div className="field-group">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Address</label>
                  <textarea className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-100 outline-none" rows="2" placeholder="Delivery location" value={address} onChange={(e) => setAddress(e.target.value)}></textarea>
                </div>

                <div className="payment-method-btns">
                  <button onClick={() => setPaymentMethod("Paystack")} className={`method-btn ${paymentMethod === "Paystack" ? 'active' : ''}`}>💳 Pay Now</button>
                  <button onClick={() => setPaymentMethod("Cash on Delivery")} className={`method-btn ${paymentMethod === "Cash on Delivery" ? 'active' : ''}`}>💵 Pay Later</button>
                </div>

                <div className="total-section">
                  <div className="total-row">
                    <span className="total-label">Total</span>
                    <span className="total-amount">₵{cartTotal.toFixed(2)}</span>
                  </div>
                  <button onClick={() => paymentMethod === 'Paystack' ? saveOrderOnlyWithPayment() : saveOrderOnly()} className="place-order-btn">
                    {paymentMethod === 'Paystack' ? 'Pay Now' : 'Pay Later'} <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <Chatbot session={session} />
    </div>
  );
}
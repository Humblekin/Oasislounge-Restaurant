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

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
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

  const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_your_key';

const handlePaystackPayment = async () => {
    // Not used - using direct URL payment instead
  };

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
    
    const email = session?.user?.email || 'customer@oasislounge.com';
    
    try {
      // 1. Initialize Paystack transaction via Edge Function
      const { data: payData, error: payError } = await supabase.functions.invoke(
        `chat?action=payment&amount=${Math.round(cartTotal)}&email=${encodeURIComponent(email)}`, 
        { method: 'POST' }
      );

      if (payError) throw payError;
      
      // Check if Paystack initialization was successful
      if (!payData?.status || !payData?.data?.authorization_url) {
        alert("Payment initialization failed: " + (payData?.message || "Unknown error"));
        return;
      }
      
      const ref = payData.data.reference;

      // 2. Save order to database with the payment reference
      const orderData = {
        user_id: session?.user?.id,
        items: cart,
        total: cartTotal,
        status: "pending",
        full_name: fullName,
        phone: phone,
        address: address,
        payment_method: 'Paystack',
        payment_ref: ref // Link this order to the Paystack transaction
      };
      
      const { error } = await supabase.from("orders").insert(orderData);
      if (error) {
        alert("Order error: " + error.message);
        return;
      }
      
      // 3. Redirect user to the actual Paystack checkout page
      window.location.href = payData.data.authorization_url;
    } catch (e) {
      console.error(e);
      alert("Payment error. Ensure PAYSTACK_SECRET_KEY is set in Edge Function secrets.");
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
      <header className="header premium-glass sticky top-0 z-100">
        <div className="container flex justify-between items-center py-4">
          <div className="flex items-center gap-12">
            <h1 className="logo cursor-pointer" onClick={() => navigate("/")}>
              OASISLOUNGE<span className="header-logo-full"> Restaurant & Bar</span>
            </h1>

            <div className="hidden md:flex nav-search-container">
              <Search className="nav-search-icon" size={16} />
              <input
                type="text"
                placeholder="Search delicacies..."
                className="nav-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              id="cart-icon-main"
              className="cart-jewel group relative"
              onClick={() => setShowCart(true)}
            >
              <ShoppingBag size={22} />
              {cart.length > 0 && (
                <span className="cart-badge-anim">{cart.length}</span>
              )}
            </button>

            {session ? (
              <div className="flex items-center gap-3">
                <div
                  onClick={() =>
                    setActiveView(activeView === "menu" ? "orders" : "menu")
                  }
                  className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg cursor-pointer hover:bg-orange-600 transition-all hover:-translate-y-1"
                  title={activeView === "menu" ? "View Orders" : "Back to Menu"}
                >
                  {activeView === "menu" ? (
                    <User size={20} />
                  ) : (
                    <UtensilsCrossed size={20} />
                  )}
                </div>
                <button onClick={logout} className="btn-logout ml-4">
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
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

      <main className="container" style={{ paddingTop: '20px' }}>
        {activeView === "menu" ? (
          <>
            <div className="hero-section mb-20 fade-in text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-full text-orange-600 text-[10px] font-black uppercase tracking-widest mb-6 border border-orange-100">
                <Sparkles size={14} /> Freshly Prepared Today
              </div>
              <h2 className="text-5xl md:text-7xl font-black mb-6 tracking-tighter leading-tight">
                Choose Your <span className="text-primary italic">Gourmet</span>{" "}
                Menu.
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto font-medium text-lg">
                Discover a curated selection of exquisite dishes, crafted with
                the finest ingredients and a touch of culinary magic.
              </p>
            </div>

            {/* Category Scroller */}
            <div className="category-pills mb-8">
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

            {loading ? (
              <div className="loading-grid flex flex-col items-center py-20 gap-4">
                <div className="spinner-pro"></div>
                <p className="text-slate-400 font-bold italic">
                  Curating the best for you...
                </p>
              </div>
            ) : (
              <div className="menu-grid mb-32">
                {filteredMenu.map((item) => (
                  <div key={item.id} className="gourmet-card group">
                    <div className="card-image-wrapper">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <UtensilsCrossed size={48} strokeWidth={1} />
                        </div>
                      )}
                      <div className="price-tag">₵{item.price}</div>

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-slate-900 shadow-2xl scale-50 group-hover:scale-100 transition-transform duration-300">
                          <Plus size={24} />
                        </div>
                      </div>
                    </div>

                    <div className="card-content">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="card-category">
                            {item.category || "Chef's Choice"}
                          </span>
                          <h3 className="card-title">{item.name}</h3>
                        </div>
                      </div>
                      <p className="card-description">
                        {item.description ||
                          "A masterpiece of taste, crafted for the most discerning palates."}
                      </p>

                      <button
                        onClick={() => addToCart(item)}
                        className="add-btn"
                      >
                        <Plus size={18} /> Add to Tray
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <section className="orders-history fade-in">
            <div className="section-header flex items-end justify-between mb-12">
              <div>
                <h2 className="text-4xl font-black tracking-tighter">
                  Your Live Feed
                </h2>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">
                  Monitor your gourmet orders in real-time
                </p>
              </div>
              <button
                onClick={() => setActiveView("menu")}
                className="btn-surface text-sm py-2 px-6 rounded-full"
              >
                Back to Menu
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-20 flex flex-col items-center gap-6 opacity-30">
                <Package size={64} strokeWidth={1} />
                <p className="font-bold italic text-slate-400 text-lg">
                  No orders found. Yet.
                </p>
                <button
                  onClick={() => setActiveView("menu")}
                  className="btn-pro px-8 py-3 rounded-full text-xs"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="order-card"
                  >
                    <div className="order-card-header">
                      <div className={`order-card-icon ${order.status === 'delivered' ? 'delivered' : ''}`}>
                        {order.status === "delivered" ? (
                          <CheckCircle size={22} />
                        ) : (
                          <Clock size={22} />
                        )}
                      </div>
                      <span className={`status-pill-pro ${order.status}`}>
                        {order.status}
                      </span>
                    </div>

                    <div className="order-item-thumb">
                      {order.items && order.items[0]?.image_url ? (
                        <img src={order.items[0].image_url} alt={order.items[0].name} />
                      ) : (
                        <Package size={24} className="m-auto text-slate-300" />
                      )}
                    </div>

                    <h4 className="font-bold text-xl mb-2 leading-tight">
                      {order.items.map((i) => i.name).join(", ")}
                    </h4>
                    <p className="text-slate-400 text-xs font-medium mb-8 uppercase tracking-widest">
                      Order #{order.id.slice(0, 8)} •{" "}
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>

                    <div className="order-card-footer">
                      <span className="text-2xl font-black text-slate-900">
                        ₵{order.total}
                      </span>
                      {order.status === "pending" && (
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="order-cancel-btn"
                        >
                          Cancel Order
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

      {/* Luxury Cart Drawer */}
      {showCart && (
        <div className="cart-drawer-overlay">
          <div
            className="cart-backdrop"
            onClick={() => setShowCart(false)}
          ></div>
          <aside className="cart-drawer fade-right">
            <div className="drawer-header flex justify-between items-center mb-12">
              <h3 className="text-3xl font-black tracking-tighter">
                Your Tray<span>.</span>
              </h3>
              <button
                onClick={() => setShowCart(false)}
                className="cart-close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="drawer-content flex-1 overflow-y-auto pr-2">
              {cart.length === 0 ? (
                <div className="text-center py-20 flex flex-col items-center gap-6 opacity-30">
                  <ShoppingBag size={64} strokeWidth={1} />
                  <p className="font-bold italic text-lg">
                    Your tray is empty.
                  </p>
                  <button
                    onClick={() => setShowCart(false)}
                    className="btn-pro"
                  >
                    Start Adding
                  </button>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="cart-item-card"
                    >
                      <div className="cart-item-img">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Package
                            size={24}
                            className="text-slate-200"
                          />
                        )}
                      </div>
                      <div className="cart-item-info">
                        <h4 className="name">{item.name}</h4>
                        <p className="price">₵{item.price}</p>
                      </div>
                      <div className="qty-controls">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="qty-btn"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="qty-val">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="qty-btn"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="drawer-footer pt-8 border-t border-slate-100 space-y-8 mt-6">
                <div className="space-y-6">
                  <div className="field-group">
                    <div className="flex items-center gap-2 mb-3">
                      <User size={16} className="text-orange-500" />
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Full Name
                      </label>
                    </div>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:bg-white transition-all outline-none"
                      placeholder="Your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone size={16} className="text-orange-500" />
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Phone Number
                      </label>
                    </div>
                    <input
                      type="tel"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:bg-white transition-all outline-none"
                      placeholder="0245123456"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={16} className="text-orange-500" />
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Delivery Location
                      </label>
                    </div>
                    <textarea
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-orange-100 focus:bg-white transition-all outline-none"
                      placeholder="Street, Building, Apartment..."
                      rows="2"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    ></textarea>
                  </div>

                  <div className="field-group">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard size={16} className="text-orange-500" />
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Payment Option
                      </label>
                    </div>
                    <div className="payment-method-btns">
                      <button
                        key="Paystack"
                        onClick={() => setPaymentMethod("Paystack")}
                        className={`method-btn ${paymentMethod === "Paystack" ? 'active' : ''}`}
                      >
                        💳 Pay Now
                      </button>
                      <button
                        key="Cash on Delivery"
                        onClick={() => setPaymentMethod("Cash on Delivery")}
                        className={`method-btn ${paymentMethod === "Cash on Delivery" ? 'active' : ''}`}
                      >
                        💵 Pay Later
                      </button>
                    </div>
                  </div>
                </div>

                <div className="total-section">
                  <div className="total-row">
                    <span className="total-label">Total</span>
                    <span className="total-amount">₵{cartTotal.toFixed(2)}</span>
                  </div>
<button
                onClick={() => {
                  if (paymentMethod === 'Paystack') {
                    saveOrderOnlyWithPayment();
                  } else {
                    saveOrderOnly();
                  }
                }}
                className="place-order-btn"
              >
                    <span>{paymentMethod === 'Paystack' ? 'Pay Now' : 'Pay Later'}</span>
                    <ChevronRight size={20} />
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

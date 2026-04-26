import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, TrendingUp, Package, Clock, LayoutDashboard, UtensilsCrossed, LogOut, ChevronRight, Upload, Image as ImageIcon, X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
   const [activeTab, setActiveTab] = useState('orders');
   const [orders, setOrders] = useState([]);
   const [menuItems, setMenuItems] = useState([]);
   const [loading, setLoading] = useState(true);
   const [editingItem, setEditingItem] = useState(null);
   const [imagePreview, setImagePreview] = useState(null);
   const fileInputRef = useRef(null);
   const navigate = useNavigate();

   const revenue = orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.total, 0);
   const pendingCount = orders.filter(o => o.status === 'pending').length;

   useEffect(() => {
      fetchData();

      const channel = supabase.channel('schema-db-changes')
         .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
         .subscribe();

      return () => { supabase.removeChannel(channel) };
   }, []);

   const fetchData = async () => {
      setLoading(true);
      const [ordersRes, menuRes] = await Promise.all([
         supabase.from('orders').select('*').order('created_at', { ascending: false }),
         supabase.from('menu_items').select('*').order('name')
      ]);
      if (!ordersRes.error) setOrders(ordersRes.data || []);
      if (!menuRes.error) setMenuItems(menuRes.data || []);
      setLoading(false);
   };

   const updateOrderStatus = async (id, newStatus) => {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', id);
      if (!error) fetchData();
   };

   const deleteOrder = async (id) => {
      if (window.confirm('Delete this order permanently?')) {
         await supabase.from('orders').delete().eq('id', id);
         fetchData();
      }
   };

   const handleImageChange = (e) => {
      const file = e.target.files[0];
      if (file) {
         const reader = new FileReader();
         reader.onloadend = () => setImagePreview(reader.result);
         reader.readAsDataURL(file);
      }
   };

   const addMenuItem = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const imageFile = formData.get('image');
      let imageUrl = null;

      try {
         if (imageFile && imageFile.size > 0) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('food-images').upload(fileName, imageFile);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('food-images').getPublicUrl(fileName);
            imageUrl = publicUrl;
         }

         const newItem = {
            name: formData.get('name'),
            price: parseFloat(formData.get('price')),
            description: formData.get('description'),
            image_url: imageUrl,
            available: true
         };

         const { error } = await supabase.from('menu_items').insert([newItem]);
         if (error) throw error;

         e.target.reset();
         setImagePreview(null);
         fetchData();
      } catch (error) {
         alert('Error adding item: ' + error.message);
      }
   };

   const saveEdit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const updated = {
         name: formData.get('name'),
         price: parseFloat(formData.get('price')),
         description: formData.get('description'),
      };

      const { error } = await supabase.from('menu_items').update(updated).eq('id', editingItem.id);
      if (!error) {
         setEditingItem(null);
         fetchData();
      }
   };

   const deleteItem = async (id) => {
      if (window.confirm('Delete this item?')) {
         await supabase.from('menu_items').delete().eq('id', id);
         fetchData();
      }
   };

   const toggleAvailability = async (id, currentVal) => {
      await supabase.from('menu_items').update({ available: !currentVal }).eq('id', id);
      fetchData();
   };

   const logout = async () => {
      await supabase.auth.signOut();
      navigate('/');
   };

   return (
      <div className="admin-dashboard flex">
         <aside className="sidebar premium-glass">
            <div className="sidebar-header">
               <h1 className="logo">Admin<span>.</span></h1>
            </div>

            <nav className="sidebar-nav mt-8">
               <button className={`nav-link ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                  <LayoutDashboard size={20} /> Live Orders
               </button>
               <button className={`nav-link ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => setActiveTab('menu')}>
                  <UtensilsCrossed size={20} /> Menu Mgmt
               </button>
            </nav>

            <button onClick={logout} className="btn-logout w-full py-4 px-6 rounded-2xl justify-center !text-sm">
            <LogOut size={20} /> Sign Out
         </button>
         </aside>

         <main className="main-content">
            <div className="stats-grid mb-8">
               <div className="premium-card stat">
                  <TrendingUp className="stat-icon revenue" />
                  <div><label>Revenue</label><span>₵{revenue.toFixed(2)}</span></div>
               </div>
               <div className="premium-card stat">
                  <Package className="stat-icon orders" />
                  <div><label>Total Orders</label><span>{orders.length}</span></div>
               </div>
               <div className="premium-card stat">
                  <Clock className="stat-icon pending" />
                  <div><label>Pending</label><span className="text-primary">{pendingCount}</span></div>
               </div>
            </div>

            {loading ? (
               <div className="loading">Syncing Live Data...</div>
            ) : activeTab === 'orders' ? (
               <section className="fade-in">
                  <h2 className="section-title mb-4">Traffic Monitor</h2>
                  <div className="premium-card table-container">
                     <table className="admin-table">
                        <thead>
                           <tr>
                              <th>Order</th>
                              <th>Items</th>
                              <th>Logistics</th>
                              <th>Total</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                           </tr>
                        </thead>
                        <tbody>
                           {orders.map(order => (
                              <tr key={order.id}>
                                 <td className="mono text-muted">
                                    <div className="font-bold">#{order.id.slice(0, 8)}</div>
                                    <div style={{ fontSize: '0.6rem' }}>{new Date(order.created_at).toLocaleTimeString()}</div>
                                 </td>
                                 <td>
                                    <div className="truncate" style={{ maxWidth: '200px', fontWeight: 600 }}>
                                       {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                                    </div>
                                 </td>
                                 <td>
                                    <div className="text-sm" style={{ maxWidth: '180px' }}>
                                       <div className="font-bold text-primary">{order.payment_method || 'N/A'}</div>
                                       <div className="truncate text-muted">{order.address || 'Dining In'}</div>
                                    </div>
                                 </td>
                                 <td className="font-bold">₵{order.total}</td>
                                 <td><span className={`badge status-${order.status}`}>{order.status}</span></td>
                                 <td style={{ textAlign: 'right' }}>
                                    <div className="flex justify-end items-center gap-2">
                                       <select className="input status-select" value={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)} style={{ width: 'auto' }}>
                                          <option value="pending">Pending</option>
                                          <option value="cooking">Cooking</option>
                                          <option value="ready">Ready</option>
                                          <option value="delivered">Delivered</option>
                                       </select>
                                       <button onClick={() => deleteOrder(order.id)} className="btn-icon"><Trash2 size={16} /></button>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </section>
            ) : (
               <div className="menu-manager flex gap-8 fade-in">
                  <div className="premium-card menu-form h-fit">
                     <h3 className="mb-4">New Menu Entry</h3>
                     <form onSubmit={addMenuItem} className="flex flex-col gap-4">
                        <input type="text" name="name" placeholder="Item Name" required className="input" />
                        <input type="number" name="price" placeholder="Price (₵)" step="0.01" required className="input" />
                        <textarea name="description" placeholder="Description..." rows="3" className="input"></textarea>

                        <div className="image-dropzone" onClick={() => fileInputRef.current.click()}>
                           {imagePreview ? (
                              <img src={imagePreview} alt="Preview" className="preview-img" />
                           ) : (
                              <div className="dropzone-content">
                                 <Upload size={24} />
                                 <span>Click to upload photo</span>
                              </div>
                           )}
                           <input type="file" name="image" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageChange} />
                        </div>

                        <button type="submit" className="btn btn-primary"><Plus size={18} /> Add Item</button>
                     </form>
                  </div>

                  <div className="menu-list">
                     <h3 className="mb-4">Live Inventory</h3>
                     <div className="inventory-grid">
                     {menuItems.map(item => (
                        <div key={item.id} className={`food-card ${!item.available ? 'archived' : ''}`}>
                           <div className="food-card-image">
                              {item.image_url ? <img src={item.image_url} alt={item.name} /> : <ImageIcon size={32} className="text-muted" />}
                              <span className={`stock-badge ${item.available ? 'in-stock' : 'out-stock'}`}>
                                 {item.available ? 'In Stock' : 'Out'}
                              </span>
                           </div>
                           <div className="food-card-content">
                              <div className="food-card-header">
                                 <h4>{item.name}</h4>
                                 <span className="food-price">₵{item.price}</span>
                              </div>
                              <p className="food-desc">{item.description}</p>
                           </div>
                           <div className="food-card-actions">
                              <button onClick={() => toggleAvailability(item.id, item.available)} className="btn-action">
                                 {item.available ? 'Mark Out' : 'Mark In'}
                              </button>
                              <button onClick={() => setEditingItem(item)} className="btn-action edit"><Edit2 size={14} /></button>
                              <button onClick={() => deleteItem(item.id)} className="btn-action delete"><Trash2 size={14} /></button>
                           </div>
                        </div>
                     ))}
                     </div>
                  </div>
               </div>
            )}
         </main>

         {editingItem && (
            <div className="modal-overlay">
               <div className="modal-content premium-card">
                  <div className="flex justify-between items-center mb-6">
                     <h3>Edit Gourmet Item</h3>
                     <button onClick={() => setEditingItem(null)} className="btn-close"><X /></button>
                  </div>
                  <form onSubmit={saveEdit} className="flex flex-col gap-4">
                     <div className="field-group">
                        <label>Name</label>
                        <input type="text" name="name" defaultValue={editingItem.name} required className="input" />
                     </div>
                     <div className="field-group">
                        <label>Price (₵)</label>
                        <input type="number" name="price" defaultValue={editingItem.price} step="0.01" required className="input" />
                     </div>
                     <div className="field-group">
                        <label>Description</label>
                        <textarea name="description" defaultValue={editingItem.description} rows="3" className="input"></textarea>
                     </div>
                     <button type="submit" className="btn btn-primary w-full mt-4"><Check size={18} /> Save Changes</button>
                  </form>
               </div>
            </div>
         )}

         <style>{`
         .admin-dashboard { min-height: 100vh; background: #f8fafc; }
         .sidebar { width: 280px; padding: 2.5rem; display: flex; flex-direction: column; border-right: 1px solid var(--border); background: #ffffff; position: fixed; height: 100vh; }
         .main-content { margin-left: 280px; flex: 1; padding: 2.5rem 4rem; }
         
         .nav-link { display: flex; align-items: center; gap: 1rem; padding: 1rem 1.5rem; border-radius: 1rem; width: 100%; text-align: left; background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-weight: 700; transition: var(--transition); margin-bottom: 0.5rem; }
         .nav-link.active { background: var(--primary); color: #ffffff; box-shadow: 0 10px 20px rgba(249, 115, 22, 0.2); }

         .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
         .stat { display: flex; align-items: center; gap: 1.5rem; background: #ffffff; }
         .stat-icon { width: 50px; height: 50px; padding: 12px; border-radius: 16px; }
         .stat-icon.revenue { background: #ecfdf5; color: #10b981; }
         .stat-icon.orders { background: #f0f9ff; color: var(--accent-blue); }
         .stat-icon.pending { background: var(--primary-light); color: var(--primary); }

         .image-dropzone { border: 2px dashed var(--border); border-radius: 1rem; height: 150px; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; transition: var(--transition); }
         .image-dropzone:hover { border-color: var(--primary); background: #fffaf5; }
         .preview-img { width: 100%; height: 100%; object-fit: cover; }
         .dropzone-content { text-align: center; color: var(--text-muted); font-size: 0.8rem; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }

         .admin-table { width: 100%; border-collapse: collapse; }
         .admin-table th { padding: 1rem 1.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border); text-align: left; }
         .admin-table td { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
         
         .btn-icon-secondary { background: #f1f5f9; color: var(--text-main); border: none; padding: 0.5rem; border-radius: 10px; cursor: pointer; transition: var(--transition); }
         .btn-icon-secondary:hover { background: var(--border); }
         .btn-icon { background: rgba(244, 63, 94, 0.05); color: var(--accent-pink); border: none; padding: 0.5rem; border-radius: 10px; cursor: pointer; transition: var(--transition); }
         .btn-icon:hover { background: var(--accent-pink); color: white; }

         .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 2rem; }
         .modal-content { width: 100%; max-width: 500px; padding: 2.5rem !important; }
         .field-group label { display: block; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem; }

         .archived { opacity: 0.4; }
         .hidden { display: none; }
         .pointer { cursor: pointer; }
         .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

         .inventory-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
         .food-card { background: #fff; border-radius: 1.25rem; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); transition: var(--transition); border: 1px solid var(--border); }
         .food-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.1); }
         .food-card.archived { opacity: 0.5; filter: grayscale(0.5); }
         .food-card-image { width: 100%; height: 180px; position: relative; overflow: hidden; background: #f1f5f9; display: flex; align-items: center; justify-content: center; }
         .food-card-image img { width: 100%; height: 100%; object-fit: cover; }
         .stock-badge { position: absolute; top: 1rem; right: 1rem; padding: 0.35rem 0.75rem; border-radius: 2rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
         .stock-badge.in-stock { background: #ecfdf5; color: #059669; }
         .stock-badge.out-stock { background: #fef2f2; color: #dc2626; }
         .food-card-content { padding: 1.25rem; }
         .food-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
         .food-card-header h4 { font-size: 1.1rem; font-weight: 700; color: var(--text-main); }
         .food-price { font-size: 1.1rem; font-weight: 800; color: var(--primary); }
         .food-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
         .food-card-actions { display: flex; gap: 0.5rem; padding: 1rem 1.25rem; border-top: 1px solid var(--border); background: #fafafa; }
         .btn-action { flex: 1; padding: 0.6rem; border-radius: 0.75rem; border: 1px solid var(--border); background: #fff; cursor: pointer; font-size: 0.75rem; font-weight: 600; transition: var(--transition); display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
         .btn-action:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
         .btn-action.edit:hover { background: var(--accent-blue); border-color: var(--accent-blue); }
         .btn-action.delete:hover { background: var(--accent-pink); border-color: var(--accent-pink); }

         @media (max-width: 1024px) {
           .sidebar { width: 100%; height: auto; position: static; }
           .main-content { margin-left: 0; }
           .stats-grid { grid-template-columns: 1fr; }
           .menu-manager { flex-direction: column; }
           .inventory-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
         }
       `}</style>
      </div>
   );
}
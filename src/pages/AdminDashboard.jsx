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
      </div>
   );
}
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, X, Send, Bot, Sparkles, CreditCard } from 'lucide-react';

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_your_key';

export default function Chatbot({ session }) {
  const [isOpen, setIsOpen] = useState(false);
  const savedMsgs = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('chat_history') || '[]') : [];
  const [messages, setMessages] = useState(savedMsgs.length > 0 ? savedMsgs : [
    { role: 'assistant', content: "Welcome to OASISLOUNGE! Good food, good vibes. What would you like to eat today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!session && typeof window !== 'undefined') {
      localStorage.removeItem('chat_history');
      setMessages([{ role: 'assistant', content: "Welcome to OASISLOUNGE! Good food, good vibes. What would you like to eat today?" }]);
    }
  }, [session]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { messages: newMessages, userId: session?.user?.id || null }
      });
      
      if (error) {
        console.error('Edge Function Error:', error);
        setMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting. Please check your connection and try again." }]);
        setIsTyping(false);
        return;
      }
      
      if (data?.payment_link) {
        setMessages([...newMessages, { role: 'assistant', content: "I've opened the payment page for you. After paying, come back and let me know so I can confirm your order!", paymentLink: data.payment_link }]);
        setIsTyping(false);
        return;
      }
      
      console.log('Chat response:', data);
      
      if (data?.error) {
        setMessages([...newMessages, { role: 'assistant', content: `Brain Error: ${data.error}` }]);
        return;
      }
      
      if (data?.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        if (data.action === 'refresh_orders') window.dispatchEvent(new Event('refresh_orders'));
      }
    } catch (err) {
      console.error('Chat Connection Error:', err);
      setMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting to my brain. Check the browser console for details." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} className="chat-trigger fade-in">
           <MessageSquare size={28} />
           <span className="ping-dot"></span>
        </button>
      )}

      {isOpen && (
        <div className="chat-window fade-in">
           <div className="chat-header premium-glass flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="bot-icon">
                    <Sparkles size={18} />
                 </div>
                 <div>
                    <h4 className="chat-title">OASISLOUNGE Concierge</h4>
                    <span className="chat-status">Active Now</span>
                 </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="close-btn"><X size={20} /></button>
               <button onClick={() => {
                 setMessages([{ role: 'assistant', content: "Welcome to OASISLOUNGE! Good food, good vibes. What would you like to eat today?" }]);
                 localStorage.removeItem('chat_history');
               }} className="clear-btn" title="Clear Chat">Clear</button>
           </div>

<div className="chat-messages hide-scrollbar">
               {messages.map((msg, idx) => (
                 <div key={idx} className={`bubble-row ${msg.role}`}>
                     <div className="bubble">
                       {msg.paymentLink || msg.content?.includes('checkout.paystack') ? (
                         <div className="payment-link-container">
                           {msg.content.includes('checkout.paystack') ? (
                             <>
                               <p>Your payment link is ready!</p>
                               <a 
                                 href={msg.paymentLink || msg.content.match(/https:\/\/[^\s]+paystack[^\s]*/)?.[0]}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="pay-btn"
                               >
                                 💳 Pay Now
                               </a>
                               <button 
                                 onClick={() => setInput("Cash on Delivery")}
                                 className="cod-btn"
                               >
                                 Or Pay on Delivery
                               </button>
                             </>
                           ) : (
                             <>
                               <p>{msg.content}</p>
                               <a 
                                 href={msg.paymentLink}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="pay-btn"
                               >
                                 💳 Pay Now
                               </a>
                               <button 
                                 onClick={() => setInput("Cash on Delivery")}
                                 className="cod-btn"
                               >
                                 Or Pay on Delivery
                               </button>
                             </>
                           )}
                         </div>
                       ) : (
                         <div className="bubble-content">
                           {msg.content}
                         </div>
                       )}
                     </div>
                  </div>
               ))}
               {isTyping && (
                 <div className="bubble-row assistant">
                    <div className="bubble typing">...</div>
                 </div>
               )}
               <div ref={messagesEndRef} />
            </div>

           <form onSubmit={sendMessage} className="chat-input-area">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about our menu..." 
                className="input" 
              />
              <button type="submit" className="send-btn" disabled={!input.trim() || isTyping}>
                 <Send size={18} />
              </button>
           </form>
        </div>
      )}

      <style>{`
        .chat-trigger { position: fixed; bottom: 2rem; right: 2rem; width: 64px; height: 64px; border-radius: 20px; background: var(--primary); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 1000; box-shadow: 0 10px 30px rgba(249, 115, 22, 0.3); transition: var(--transition); }
        .chat-trigger:hover { transform: scale(1.1); box-shadow: 0 15px 40px rgba(249, 115, 22, 0.4); }
        .ping-dot { position: absolute; top: -5px; right: -5px; width: 12px; height: 12px; border-radius: 50%; background: #10b981; border: 2px solid white; }

        .chat-window { position: fixed; bottom: 2rem; right: 2rem; width: 380px; height: 580px; background: #ffffff; border: 1px solid var(--border); border-radius: var(--radius-xl); z-index: 1000; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.2); }
        .chat-header { padding: 1.5rem; border-bottom: 1px solid var(--border); background: white; }
        .bot-icon { background: var(--primary-light); color: var(--primary); width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .chat-title { font-size: 0.9rem; font-weight: 800; color: var(--text-main); }
        .chat-status { font-size: 0.6rem; color: #10b981; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 4px; }
        .chat-status::before { content: ''; width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
        
        .chat-messages { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; background: #fafafa; scroll-behavior: smooth; }
        .bubble-row { display: flex; width: 100%; margin-bottom: 0.5rem; }
        .bubble-row.user { justify-content: flex-end; }
        .bubble-row.assistant { justify-content: flex-start; }
        .bubble { 
           max-width: 85%; 
           padding: 0.8rem 1.2rem; 
           border-radius: 1.25rem; 
           font-size: 0.85rem; 
           line-height: 1.5; 
           box-shadow: 0 2px 4px rgba(0,0,0,0.02); 
           word-wrap: break-word;
           overflow-wrap: break-word;
           white-space: pre-wrap;
        }
.user .bubble { background: var(--primary); color: white; font-weight: 600; border-bottom-right-radius: 0; }
         .assistant .bubble { background: white; color: var(--text-main); border: 1px solid var(--border); border-bottom-left-radius: 0; }
         
.payment-link-container { display: flex; flex-direction: column; gap: 0.75rem; }
          .pay-btn { background: #10b981; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: var(--transition); width: 100%; text-align: center; text-decoration: none; display: block; }
          .pay-btn:hover { background: #059669; transform: scale(1.02); }
          .cod-btn { background: #64748b; color: white; border: none; padding: 0.6rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.8rem; cursor: pointer; width: 100%; text-align: center; }
          .cod-btn:hover { background: #475569; }
          .bubble-content { white-space: pre-wrap; word-wrap: break-word; }
          .pay-btn:disabled { background: #ccc; cursor: not-allowed; }
        
        .chat-input-area { padding: 1rem 1.5rem; background: white; display: flex; gap: 0.5rem; border-top: 1px solid var(--border); align-items: center; }
        .send-btn { background: var(--primary); color: white; border: none; width: 44px; height: 44px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: var(--transition); }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        @media (max-width: 480px) {
          .chat-window { bottom: 0; right: 0; width: 100%; height: 100%; border-radius: 0; }
        }
      `}</style>
    </>
  );
}

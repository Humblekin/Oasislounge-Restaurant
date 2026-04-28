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
        body: { messages: newMessages, userId: session?.user?.id || null, origin: window.location.origin }
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
    </>
  );
}

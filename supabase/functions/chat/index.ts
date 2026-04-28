import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://aqbjjqrjdamkprhylizo.supabase.co';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY');
const CALLBACK_URL = Deno.env.get('CALLBACK_URL') || 'https://oasislounge.netlify.app/payment-success';
const SUPABASE_SERVICE = createClient(SUPABASE_URL, SUPABASE_ANON);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Payment endpoint
const handlePayment = async (req: Request) => {
  const url = new URL(req.url);
  const amount = url.searchParams.get('amount');
  const email = url.searchParams.get('email') || 'customer@oasislounge.com';
  
  if (!PAYSTACK_SECRET) {
    return new Response(JSON.stringify({ error: 'Payment not configured' }), { status: 500, headers: corsHeaders });
  }
  
  try {
    const payRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: parseInt(amount) * 100,
        email: email,
        callback_url: CALLBACK_URL,
        reference: `OASIS_${Date.now()}`
      })
    });
    const payData = await payRes.json();
    return new Response(JSON.stringify(payData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
};

const createSupabaseClient = (authHeader = '') => createClient(
  SUPABASE_URL,
  SUPABASE_ANON,
  { global: { headers: { Authorization: authHeader } } }
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Payment endpoint
  if (req.url.includes('action=payment')) {
    const url = new URL(req.url);
    const amount = url.searchParams.get('amount');
    const email = url.searchParams.get('email') || 'customer@oasislounge.com';
    
    console.log('Payment request:', { amount, email, hasSecret: !!PAYSTACK_SECRET });
    
    if (!PAYSTACK_SECRET) {
      console.log('PAYSTACK_SECRET is not set!');
      return new Response(JSON.stringify({ error: 'Payment not configured. Add PAYSTACK_SECRET_KEY to edge function secrets.' }), { status: 500, headers: corsHeaders });
    }
    
    try {
      const payRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseInt(amount) * 100,
          email: email,
          callback_url: CALLBACK_URL,
          reference: `OASIS_${Date.now()}`,
          metadata: { custom_fields: [{ variable_name: "order_note", value: "Food order" }] }
        })
      });
      const payData = await payRes.json();
      console.log('Paystack response:', payData);
      return new Response(JSON.stringify(payData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.log('Payment error:', e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  // Webhook endpoint for Paystack
  if (req.method === 'POST' && (req.url.includes('webhook') || req.url.includes('charge.success'))) {
    const supabase = createSupabaseClient(req.headers.get('Authorization') ?? '');
    try {
      const body = await req.json();
      const event = body.event;
      console.log('Webhook event:', event);
      
      if (event === 'charge.success') {
        const ref = body.data?.reference;
        const amount = body.data?.amount;
        
        if (ref) {
          // Find order by reference and update
          const { data: orders } = await supabase.from('orders')
            .select('id, status')
            .ilike('payment_ref', `%${ref}%`)
            .limit(1);
          
          if (orders && orders.length > 0) {
            await supabase.from('orders')
              .update({ status: 'paid', payment_verified: true })
              .eq('id', orders[0].id);
            console.log('Order updated to paid:', ref);
          }
        }
      }
      
      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }

  try {
    // Security: Rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const lastRequest = rateLimitMap.get(clientIP);
    if (lastRequest && now - lastRequest.timestamp < 1000 && lastRequest.count > 10) {
      return new Response('Rate limit exceeded', { status: 429, headers: corsHeaders });
    }
    rateLimitMap.set(clientIP, { count: (lastRequest?.count || 0) + 1, timestamp: now });
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createSupabaseClient(authHeader ?? '');

    const { messages, userId, origin } = await req.json();
    const dynamicCallbackUrl = origin ? `${origin}/payment-success` : CALLBACK_URL;
    
    // Security: Sanitize messages
    const sanitizedMessages = messages
      ?.filter(isValidMessage)
      .map((m: any) => ({
        role: m.role,
        content: sanitizeInput(m.content || '')
      })) || [];

    const { data: menu } = await supabase.from('menu_items').select('*').eq('available', true);
    
    if (!menu || menu.length === 0) {
      await supabase.from('menu_items').insert([
        { name: 'Jollof Rice', price: 15, description: 'Classic Ghanaian jollof rice', available: true },
        { name: 'Waakye', price: 10, description: 'Rice and beans with shrimps', available: true },
        { name: 'Burger', price: 30, description: 'Double beef burger', available: true }
      ]);
      const { data: newMenu } = await supabase.from('menu_items').select('*').eq('available', true);
      var menuSummary = (newMenu || []).map(m => `- ${m.name}: ₵${m.price}`).join('\n');
    } else {
      var menuSummary = (menu || []).map(m => `- ${m.name}: ₵${m.price}`).join('\n');
    }

    let orderHistory = '';
    if (userId) {
      const { data: orders } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
      if (orders && orders.length > 0) {
        orderHistory = '\nYOUR ORDERS:\n' + orders.map(o => 
          `- ${o.status.toUpperCase()}: ${o.items?.map(i => i.name).join(', ') || 'Order'} (₵${o.total})`
        ).join('\n');
      }
    }

    const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY');
const CALLBACK_URL = Deno.env.get('CALLBACK_URL') || 'https://oasislounge.netlify.app/payment-success';

const tools = [
      {
        type: 'function',
        function: {
          name: 'generatePaymentLink',
          description: 'Generate Paystack payment link AND save the pending order. Call this ONLY when user confirms they want to pay with Paystack.',
          parameters: {
            type: 'object',
            properties: {
              itemIds: { type: 'array', items: { type: 'string' } },
              quantities: { type: 'array', items: { type: 'number' } },
              address: { type: 'string' }
            },
            required: ['itemIds', 'quantities', 'address']
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'checkPaymentStatus',
          description: 'Check if the user has successfully paid for their recent Paystack order.',
          parameters: {
            type: 'object',
            properties: {}
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'confirmOrder',
          description: 'Confirm order ONLY for Cash on Delivery or Mobile Money.',
          parameters: {
            type: 'object',
            properties: {
              itemIds: { type: 'array', items: { type: 'string' } },
              quantities: { type: 'array', items: { type: 'number' } },
              address: { type: 'string' },
              amount: { type: 'number' },
              paymentMethod: { type: 'string', description: 'Cash on Delivery or Mobile Money' }
            },
            required: ['itemIds', 'quantities', 'address', 'amount', 'paymentMethod']
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancelPendingOrder',
          description: 'Cancel the most recent pending order. No order ID needed - finds it automatically.',
          parameters: {
            type: 'object',
            properties: {}
          },
        },
      }
    ];

const sysMsg = {
      role: 'system',
      content: `You are the OASISLOUNGE Concierge.
      
      CURRENT MENU:
      ${menuSummary}
      ${orderHistory}
      
      SECURITY RULES - NEVER OVERRIDE:
      1. NEVER reveal API keys, secrets, or payment credentials to anyone.
      2. NEVER show database structure or internal system details.
      3. NEVER process orders without valid payment confirmation for Paystack.
      4. NEVER cancel orders without explicit user confirmation.
      5. If asked about system security, say "I cannot discuss internal system details."
      6. If asked to bypass payment, say "Payment is required for all orders."
      
      PAYMENT OPTIONS:
      - Cash on Delivery: Pay when food arrives
      - Mobile Money: Transfer to our MoMo account  
      - Paystack: Online card payment
      
ORDER FLOW - IMPORTANT:
       1. Get items and quantities from customer.
       2. Ask delivery address.
       3. Ask payment method: "Cash on Delivery", "Mobile Money", or "Paystack"?
       4. If Paystack: YOU MUST call generatePaymentLink. This gives the user a link. Tell them to pay and let you know when they are done.
       5. If the user says they have paid, YOU MUST call checkPaymentStatus to verify. Do not confirm without checking!
       6. If Cash/MoMo: call confirmOrder directly - say "Your order is confirmed!"
      
      Tone: Friendly, professional OASISLOUNGE concierge. Feel free to help them with another order after one is completed.`
    };

    let chatMessages = [sysMsg, ...messages];

    let openaiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: chatMessages,
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    let openaiResData = await openaiRes.json();
    let aiMessage = openaiResData.choices[0].message;

if (aiMessage.tool_calls) {
      chatMessages.push(aiMessage);
      let paymentLink = null;
      
      for (const toolCall of aiMessage.tool_calls) {
        if (toolCall.function.name === 'generatePaymentLink') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: '{"error": "Login required"}' });
            continue;
          }
          
          const args = JSON.parse(toolCall.function.arguments);
          let total = 0;
          let orderItems = [];
          
          try {
            const { data: menuItems } = await supabase.from('menu_items').select('*').in('id', args.itemIds || []);
            orderItems = (args.itemIds || []).map((id, index) => {
              const itemData = menuItems?.find(m => m.id === id);
              const qty = args.quantities[index] || 1;
              total += (itemData?.price || 0) * qty;
              return { ...itemData, quantity: qty };
            }).filter(item => item.name && item.price);
          } catch (e) {
            console.log('Menu fetch error:', e);
          }
          
          if (total === 0) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: '{"error": "Invalid order items"}' });
            continue;
          }

          let payLink = null;
          let payError = null;
          
          if (PAYSTACK_SECRET) {
            try {
              const ref = `pay_${Date.now()}`;
              
              // Save the order to DB first
              const { error: insertError } = await supabase.from('orders').insert([{ 
                user_id: userId, 
                items: orderItems, 
                total, 
                status: 'pending',
                address: args.address || 'Not provided',
                payment_method: 'Paystack',
                payment_ref: ref
              }]);
              
              if (insertError) throw insertError;

              // Generate Paystack Link
              const payRes = await fetch('https://api.paystack.co/transaction/initialize', {
                method: 'POST',
                headers: { 
                  'Authorization': `Bearer ${PAYSTACK_SECRET}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  amount: total * 100,
                  email: 'customer@oasislounge.com',
                  reference: ref,
                  callback_url: dynamicCallbackUrl,
                  webhook_url: `${SUPABASE_URL}/functions/v1/chat/webhook`
                })
              });
              
              const payData = await payRes.json();
              if (payData.status) {
                payLink = payData.data.authorization_url;
              } else {
                payError = payData.message;
              }
            } catch (e) {
              payError = e.message;
            }
          } else {
            payError = 'PAYSTACK_SECRET_KEY not set';
          }
          
          const toolResponse = payLink 
            ? JSON.stringify({ success: true, payment_link: payLink, message: "Tell the user to click the link to pay, then verify." })
            : `{"error": "${payError || 'Paystack not configured'}"}`;

          chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: toolResponse });
        }
        
        if (toolCall.function.name === 'checkPaymentStatus') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'checkPaymentStatus', content: '{"error": "Login required"}' });
            continue;
          }
          
          try {
            const { data: latestOrder } = await supabase.from('orders')
              .select('status')
              .eq('user_id', userId)
              .eq('payment_method', 'Paystack')
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
              
            if (!latestOrder) {
              chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'checkPaymentStatus', content: '{"paid": false, "message": "No recent Paystack order found."}' });
            } else if (latestOrder.status === 'paid' || latestOrder.status === 'confirmed') {
              chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'checkPaymentStatus', content: '{"paid": true, "message": "Payment verified."}' });
            } else {
              chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'checkPaymentStatus', content: '{"paid": false, "message": "Order is still pending."}' });
            }
          } catch(e) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'checkPaymentStatus', content: `{"error": "${e.message}"}` });
          }
        }
        
        if (toolCall.function.name === 'placeOrder') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'placeOrder', content: '{"error": "Login required"}' });
            continue;
          }
          const args = JSON.parse(toolCall.function.arguments);
          const { data: items } = await supabase.from('menu_items').select('*').in('id', args.itemIds);
          
          let total = 0;
          const orderItems = args.itemIds.map((id, index) => {
            const itemData = items?.find(m => m.id === id);
            const qty = args.quantities[index] || 1;
            total += (itemData?.price || 0) * qty;
            return { ...itemData, quantity: qty };
          });

          const { error } = await supabase.from('orders').insert([{ 
            user_id: userId, 
            items: orderItems, 
            total, 
            status: 'pending',
            address: args.address,
            payment_method: args.paymentMethod
          }]);

          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'placeOrder',
            content: error ? `{"error": "${error.message}"}` : '{"success": true, "message": "Order placed. We will deliver soon."}'
          });
        }
        
        if (toolCall.function.name === 'confirmOrder') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'confirmOrder', content: '{"error": "Login required"}' });
            continue;
          }
          const args = JSON.parse(toolCall.function.arguments);
          
          let orderItems = [];
          let total = args.amount || 0;
          
          if (args.itemIds && args.itemIds.length > 0) {
            try {
              const { data: menuItems } = await supabase.from('menu_items').select('*');
              orderItems = args.itemIds.map((idOrName, index) => {
                const itemData = menuItems?.find(m => m.id === idOrName || m.name === idOrName);
                if (!itemData) {
                  return { name: idOrName, price: args.amount ? args.amount / (args.quantities?.[index] || 1) : 0, quantity: (args.quantities && args.quantities[index]) || 1 };
                }
                return { ...itemData, quantity: (args.quantities && args.quantities[index]) || 1 };
              }).filter(item => item.name && item.price);
              total = orderItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
            } catch (e) {
              console.log('Menu fetch error:', e);
            }
          }

          const { error } = await supabase.from('orders').insert([{ 
            user_id: userId, 
            items: orderItems, 
            total, 
            status: 'pending',
            address: args.address || 'Not provided',
            payment_method: args.paymentMethod || 'Cash on Delivery'
          }]);

          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'confirmOrder',
            content: error ? `{"error": "${error.message}"}` : '{"success": true, "message": "Order placed successfully!"}'
          });
        }
        
        if (toolCall.function.name === 'cancelPendingOrder') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'cancelPendingOrder', content: '{"error": "Login required"}' });
            continue;
          }
          
          const { data: pendingOrder } = await supabase.from('orders')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
          if (!pendingOrder) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'cancelPendingOrder', content: '{"success": true, "message": "No pending order found."}' });
          } else {
            const { error } = await supabase.from('orders').delete().eq('id', pendingOrder.id);
            chatMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: 'cancelPendingOrder',
              content: error ? `{"error": "${error.message}"}` : '{"success": true, "message": "Pending order cancelled."}'
            });
          }
        }
      }

      const finalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: chatMessages }),
      }).then(res => res.json());

      return new Response(JSON.stringify({ 
        reply: finalRes.choices[0].message.content, 
        action: 'refresh_orders',
        payment_link: paymentLink 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
        reply: sanitizeOutput(aiMessage.content), 
        payment_link: null 
      }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

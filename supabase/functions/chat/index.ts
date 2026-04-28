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
  const origin = url.searchParams.get('origin');
  const dynamicCallbackUrl = origin ? `${origin}/payment-success` : CALLBACK_URL;
  
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
        callback_url: dynamicCallbackUrl,
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

const rateLimitMap = new Map();

const isValidMessage = (m: any) => m && m.role && m.content && typeof m.content === 'string';

const sanitizeInput = (input: string) => input
  .replace(/[<>]/g, '')
  .slice(0, 2000);

const sanitizeOutput = (input: string) => input
  ? input.replace(/[<>]/g, '')
  : input;

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

    // Extract order from recent messages
    const lastMsgs = sanitizedMessages.slice(-6);
    const lastText = lastMsgs.map(m => m.content).join(' ').toLowerCase();
    
    // Check if user wants Paystack or Cash
    const wantsOnline = lastText.includes('online') || lastText.includes('paystack') || lastText.includes('pay online');
    const wantsCash = lastText.includes('cash') || lastText.includes('cod');
    const paidConfirmation = lastText.includes('paid') || lastText.includes('i have paid') || lastText.includes('done paying');
    
    // If user says they paid, verify payment
    if (paidConfirmation && userId) {
      try {
        const { data: latestOrder } = await supabase.from('orders')
          .select('*')
          .eq('user_id', userId)
          .eq('payment_method', 'Paystack')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (latestOrder) {
          if (latestOrder.status === 'pending') {
            // Verify with Paystack
            try {
              const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(latestOrder.payment_ref)}`, {
                headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
              });
              const verifyData = await verifyRes.json();
              if (verifyData.status && verifyData.data.status === 'success') {
                await supabase.from('orders').update({ status: 'cooking' }).eq('id', latestOrder.id);
                return new Response(JSON.stringify({
                  reply: 'Payment confirmed! Your order is being prepared. We will call when it is on the way!',
                  action: 'refresh_orders'
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
            } catch(e) {}
            return new Response(JSON.stringify({
              reply: 'We see your order is pending payment. Please confirm you paid with the OTP you received.'
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else if (latestOrder.status === 'cooking' || latestOrder.status === 'ready') {
            return new Response(JSON.stringify({
              reply: `Your order is ${latestOrder.status}! We'll call when arriving.`
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      } catch(e) {
        return new Response(JSON.stringify({
          reply: 'No pending order found. Please start a new order.'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    
    // Fetch menu for order matching
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

    // Check if user ordered - parse items from conversation
    let orderItems: any[] = [];
    let address = '';
    let paymentMethod = wantsCash ? 'Cash on Delivery' : (wantsOnline ? 'Paystack' : '');
    
    for (const msg of lastMsgs) {
      const c = msg.content.toLowerCase();
      // Match menu items
      for (const item of menu || []) {
        if (c.includes(item.name.toLowerCase())) {
          if (!orderItems.find(i => i.name === item.name)) {
            orderItems.push({ ...item, quantity: 1 });
          }
        }
      }
      // Match address patterns
      const addrMatch = msg.content.match(/(?:to|deliver(?:y)?(?:to)?|at)\s+([^,.\n]+)/i);
      if (addrMatch && !address) {
        address = addrMatch[1].trim();
      }
    }

    // Complete order - process payment
    if (orderItems.length > 0 && address && paymentMethod && (wantsOnline || wantsCash)) {
      const total = orderItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
      
      if (paymentMethod === 'Paystack' && userId && PAYSTACK_SECRET && !wantsCash) {
        const ref = `pay_${Date.now()}`;
        await supabase.from('orders').insert([{
          user_id: userId,
          items: orderItems,
          total,
          status: 'pending',
          address,
          payment_method: 'Paystack',
          payment_ref: ref
        }]);
        
        try {
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
              callback_url: dynamicCallbackUrl
            })
          });
          const payData = await payRes.json();
          console.log('Paystack response:', JSON.stringify(payData));
          if (payData.status) {
            return new Response(JSON.stringify({
              reply: `Order ready! Total: ₵${total}`,
              payment_link: payData.data.authorization_url,
              action: 'refresh_orders'
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          } else {
            console.log('Paystack failed:', payData);
          }
        } catch(e) {
          console.log('Paystack error:', e);
        }
      } else if (paymentMethod === 'Cash on Delivery' || wantsCash) {
        await supabase.from('orders').insert([{
          user_id: userId,
          items: orderItems,
          total,
          status: 'pending',
          address,
          payment_method: 'Cash on Delivery'
        }]);
        
        return new Response(JSON.stringify({
          reply: `Order confirmed! We'll call when we arrive at ${address}.`,
          action: 'refresh_orders'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    
    // Continue normal chat flow...
    let orderHistory = '';
    if (userId) {
      const { data: orders } = await supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5);
      if (orders && orders.length > 0) {
        orderHistory = '\nYOUR ORDERS:\n' + orders.map(o => 
          `- ${o.status.toUpperCase()}: ${o.items?.map(i => i.name).join(', ') || 'Order'} (₵${o.total})`
        ).join('\n');
      }
}

    const tools = [
      {
        type: 'function',
        function: {
          name: 'generatePaymentLink',
          description: 'Create payment link. REQUIRED: items (array of names), quantities, address. Example: {items: ["Burger"], quantities: [1], address: "123 Main St"}',
          parameters: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'string' } },
              quantities: { type: 'array', items: { type: 'number' } },
              address: { type: 'string' }
            },
            required: ['items', 'quantities', 'address']
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'confirmOrder',
          description: 'Confirm cash on delivery order. Required: items, quantities, address, amount, paymentMethod',
          parameters: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'string' } },
              quantities: { type: 'array', items: { type: 'number' } },
              address: { type: 'string' },
              amount: { type: 'number' },
              paymentMethod: { type: 'string' }
            },
            required: ['items', 'quantities', 'address', 'amount', 'paymentMethod']
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'checkPaymentStatus',
          description: 'Check if user paid. No arguments needed.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getMenu',
          description: 'Get current menu items and prices. No arguments needed.',
          parameters: { type: 'object', properties: {} },
        },
      }
    ];

const sysMsg = {
      role: 'system',
      name: 'oasis_concierge',
      content: `You are OASISLOUNGE ordering assistant.

MENU: ${menuSummary}

STRICT RULES:
1. NEVER write (function= or any tool syntax in your response - user cannot see it
2. If you write a tool call, it goes to the system automatically - user only sees your text response
3. Ask: "What would you like?" then "Delivery address?" then "Cash or online?"
4. When user says "online" or "paystack" - respond "Generating payment link..." ONLY, then wait
5. Don't explain tool calls - they happen automatically

Example conversation:
User: I want Burger
You: Sure! Anything else?
User: Just Burger
You: Delivery address?
User: 123 Main St
You: Pay cash on delivery or online?
User: online
You: Generating payment link... [system handles the rest]

Your job: Keep responses SHORT and natural.`
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
    let aiMessage = openaiResData.choices?.[0]?.message;
    
    if (!aiMessage) {
      return new Response(JSON.stringify({ error: 'No response from AI model' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (aiMessage.tool_calls) {
      chatMessages.push(aiMessage);
      let paymentLink = null;
      
      for (const toolCall of aiMessage.tool_calls) {
        if (toolCall.function.name === 'generatePaymentLink') {
          if (!userId) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: '{"error": "LOGIN_REQUIRED: You must be logged in to pay. Please login or sign up first, then try again."}' });
            continue;
          }
          
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: `{"error": "Invalid arguments: ${e.message}"}` });
            continue;
          }
          console.log('generatePaymentLink called, args:', args);
          
          let itemNames = args.items || [];
          let quantities = args.quantities || [];
          let total = 0;
          let orderItems = [];
          
          if (itemNames.length === 0) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: '{"error": "No items provided. Please tell me what you want to order."}' });
            continue;
          }
          
          try {
            const { data: menuItems } = await supabase.from('menu_items').select('*');
            orderItems = itemNames.map((name, index) => {
              const itemData = menuItems?.find(m => m.name.toLowerCase() === name.toLowerCase() || m.name.includes(name));
              const qty = quantities?.[index] || 1;
              if (itemData) {
                total += (itemData.price || 0) * qty;
                return { ...itemData, quantity: qty };
              }
              return null;
            }).filter(item => item !== null);
          } catch (e) {
            console.log('Menu fetch error:', e);
          }
          
          if (orderItems.length === 0) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'generatePaymentLink', content: '{"error": "Items not found. Please choose from our menu: Jollof Rice, Waakye, Burger, or Fries."}' });
            continue;
          }

          let payLink = null;
          let payError = null;
          
          if (PAYSTACK_SECRET) {
            console.log('PAYSTACK_SECRET is set, generating payment link...');
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
              console.log('Paystack response:', JSON.stringify(payData));
              if (payData.status) {
                payLink = payData.data.authorization_url;
                console.log('Payment link generated:', payLink);
              } else {
                payError = payData.message;
                console.log('Paystack error:', payError);
              }
            } catch (e) {
              payError = e.message;
              console.log('Paystack exception:', e);
            }
          } else {
            payError = 'PAYSTACK_SECRET_KEY not set';
          }
          
          const toolResponse = payLink 
            ? JSON.stringify({ success: true, payment_link: payLink, message: "Tell the user to click the link to pay, then verify." })
            : `{"error": "${payError || 'Paystack not configured'}"}`;

          console.log('Tool response:', toolResponse);
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
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'placeOrder', content: `{"error": "Invalid arguments"}` });
            continue;
          }
          const { data: items } = await supabase.from('menu_items').select('*').in('id', args.itemIds || []);
          
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
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            chatMessages.push({ role: 'tool', tool_call_id: toolCall.id, name: 'confirmOrder', content: `{"error": "Invalid arguments"}` });
            continue;
          }
          
          let itemNames = args.items || [];
          let quantities = args.quantities || [];
          let orderItems = [];
          let total = args.amount || 0;
          
          if (itemNames && itemNames.length > 0) {
            try {
              const { data: menuItems } = await supabase.from('menu_items').select('*');
              orderItems = itemNames.map((name, index) => {
                const itemData = menuItems?.find(m => m.name.toLowerCase() === name.toLowerCase() || m.name.includes(name));
                const qty = quantities?.[index] || 1;
                if (itemData) {
                  return { ...itemData, quantity: qty };
                }
                return { name: name, price: 0, quantity: qty };
              }).filter(item => item.name && (item.price > 0 || total > 0));
              total = orderItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0) || total;
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
        
        if (toolCall.function.name === 'getMenu') {
          const { data: menuItems } = await supabase.from('menu_items').select('name, price').eq('available', true);
          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'getMenu',
            content: JSON.stringify({ menu: menuItems || [] })
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

      let replyText = finalRes.choices?.[0]?.message?.content || 'Something went wrong';
      
      return new Response(JSON.stringify({ 
        reply: replyText, 
        action: 'refresh_orders',
        payment_link: paymentLink 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let replyText = aiMessage.content || 'Something went wrong';
    
    return new Response(JSON.stringify({ 
        reply: replyText, 
        action: 'refresh_orders',
        payment_link: null 
      }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.log('Edge function error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

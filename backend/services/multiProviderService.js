/**
 * ATOMX ENGAGE — UNIFIED MULTI-PROVIDER AI SERVICE
 * Supports OpenAI, Google Gemini, Groq, and OpenRouter
 * Real-time dynamic model fetching and context-aware generation
 */

const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT_TEMPLATE = `
You are ATOMX ENGAGE, an elite AI content engagement strategist.
Your mission is to generate authentic, high-value, highly-engaging replies to Twitter/X posts.
Rules:
1. Sound like a knowledgeable founder / operator. Avoid hollow buzzwords, robotic platitudes, or excessive exclamation marks.
2. Add genuine insight, relevant nuance, or a sharp perspective that invites dialogue.
3. Keep the reply clean, punchy, and appropriate for social feeds.
4. Adhere strictly to the requested tone and character constraints.
`.trim();

const STYLE_GUIDELINES = {
  'Natural & Concise': 'Concise, sharp, everyday conversational tone. Under 180 characters. High signal.',
  'Professional': 'Executive, analytical, authoritative perspective backed by business logic.',
  'Engaging Question': 'Highlight a key premise from the post and ask an insightful follow-up question that sparks thoughtful replies.',
  'Friendly': 'Warm, validating, enthusiastic yet mature tone.',
  'Witty': 'Clever, dry humor, sharp observation without being snarky or rude.'
};

// Fallback curated model lists per provider (used when API key is missing or offline)
const DEFAULT_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Omni Flagship)', context: '128k' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cheap)', context: '128k' },
    { id: 'o1-preview', name: 'OpenAI o1 Preview (Deep Reasoning)', context: '128k' },
    { id: 'o1-mini', name: 'OpenAI o1 Mini (Fast Reasoning)', context: '128k' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: '128k' }
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Ultra Fast)', context: '1M' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Complex Analysis)', context: '2M' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Experimental', context: '1M' },
    { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B (Low Latency)', context: '1M' }
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Groq LPU)', context: '128k' },
    { id: 'allam-2-7b', name: 'ALLaM 2 7B (SDAIA / Groq)', context: '4k' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct (Groq)', context: '128k' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Blazing Fast)', context: '128k' },
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Groq)', context: '131k' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', context: '128k' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (MoE Architecture)', context: '32k' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT (Google on Groq)', context: '8k' }
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Meta Llama 3.3 70B Instruct', context: '128k' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (State-of-the-Art)', context: '200k' },
    { id: 'openai/gpt-4o', name: 'GPT-4o via OpenRouter', context: '128k' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (High Efficiency)', context: '64k' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)', context: '128k' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', context: '1M' },
    { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 via OpenRouter', context: '1M' }
  ]
};

// Key loader helper
function getProviderKey(provider) {
  const norm = (provider || 'openai').toLowerCase();
  const envVarMap = {
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY'
  };

  const keyName = envVarMap[norm];
  if (!keyName) return '';

  // 1. Check keys saved via Admin Control Center in aiSettings.json
  try {
    const aiSettingsPath = path.join(__dirname, '../data/aiSettings.json');
    if (fs.existsSync(aiSettingsPath)) {
      const data = JSON.parse(fs.readFileSync(aiSettingsPath, 'utf8'));
      if (data.apiKeys && data.apiKeys[norm] && data.apiKeys[norm].trim().length > 5) {
        return data.apiKeys[norm].trim();
      }
    }
  } catch (e) {}

  // 2. Check runtime process.env
  if (process.env[keyName] && process.env[keyName].trim().length > 5) {
    return process.env[keyName].trim();
  }

  // 3. Check backend/.env directly
  try {
    const envFile = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const regex = new RegExp(`${keyName}=([^\\r\\n\\s]+)`);
      const match = content.match(regex);
      if (match && match[1]) return match[1].trim();
    }
    const envExFile = path.join(__dirname, '..', '.env.example');
    if (fs.existsSync(envExFile)) {
      const content = fs.readFileSync(envExFile, 'utf8');
      const regex = new RegExp(`${keyName}=([^\\r\\n\\s]+)`);
      const match = content.match(regex);
      if (match && match[1]) return match[1].trim();
    }
  } catch (e) {}

  return '';
}

/**
 * Fetch live available models in real-time from the chosen provider API
 */
async function fetchLiveModels(provider, customApiKey = null) {
  const prov = (provider || 'openai').toLowerCase();
  const apiKey = customApiKey || getProviderKey(prov);

  // OpenRouter models endpoint is public and does not require an API key to list models
  if (!apiKey && prov !== 'openrouter') {
    return {
      provider: prov,
      isLive: false,
      message: `No API key configured for ${prov.toUpperCase()}. Showing curated models.`,
      models: DEFAULT_MODELS[prov] || []
    };
  }

  try {
    switch (prov) {
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
        const data = await res.json();
        // Filter chat-relevant models
        const chatModels = (data.data || [])
          .filter(m => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('chat'))
          .sort((a, b) => (b.created || 0) - (a.created || 0))
          .map(m => ({ id: m.id, name: m.id, context: 'Active' }));

        return {
          provider: 'openai',
          isLive: true,
          count: chatModels.length,
          models: chatModels.length > 0 ? chatModels : DEFAULT_MODELS.openai
        };
      }

      case 'gemini': {
        // Fetch from Google Generative Language models endpoint
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
        const data = await res.json();
        const geminiModels = (data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => {
            const cleanId = m.name.replace('models/', '');
            return {
              id: cleanId,
              name: m.displayName || cleanId,
              context: m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}k` : '1M'
            };
          });

        return {
          provider: 'gemini',
          isLive: true,
          count: geminiModels.length,
          models: geminiModels.length > 0 ? geminiModels : DEFAULT_MODELS.gemini
        };
      }

      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
        const data = await res.json();
        const liveGroqModels = (data.data || [])
          .filter(m => m.active !== false)
          .map(m => ({
            id: m.id,
            name: `${m.name || m.id} (${m.owned_by || 'Groq'})`,
            context: m.context_window ? `${Math.round(m.context_window / 1000)}k` : '128k'
          }));

        return {
          provider: 'groq',
          isLive: true,
          count: liveGroqModels.length > 0 ? liveGroqModels.length : DEFAULT_MODELS.groq.length,
          models: liveGroqModels.length > 0 ? liveGroqModels : DEFAULT_MODELS.groq
        };
      }

      case 'openrouter': {
        const headers = {
          'HTTP-Referer': 'https://atomx.io',
          'X-Title': 'ATOMX ENGAGE'
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
        if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
        const data = await res.json();

        // Priority models to float at the very top of OpenRouter's 450+ models
        const priorityIds = [
          'meta-llama/llama-3.3-70b-instruct',
          'anthropic/claude-3.5-sonnet',
          'openai/gpt-4o',
          'openai/gpt-4o-mini',
          'deepseek/deepseek-chat',
          'deepseek/deepseek-r1',
          'google/gemini-2.0-flash-001',
          'google/gemini-flash-1.5',
          'meta-llama/llama-3.1-70b-instruct',
          'meta-llama/llama-3.1-8b-instruct',
          'mistralai/mistral-large-2407',
          'qwen/qwen-2.5-72b-instruct'
        ];

        const orModels = (data.data || []).map(m => ({
          id: m.id,
          name: m.name || m.id,
          context: m.context_length ? `${Math.round(m.context_length / 1000)}k` : 'Unknown',
          pricing: m.pricing?.prompt ? `$${(Number(m.pricing.prompt) * 1000000).toFixed(2)}/M` : 'Free'
        }));

        // Sort: priority models first, then alphabetical by ID
        orModels.sort((a, b) => {
          const aPrio = priorityIds.indexOf(a.id);
          const bPrio = priorityIds.indexOf(b.id);
          if (aPrio !== -1 && bPrio !== -1) return aPrio - bPrio;
          if (aPrio !== -1) return -1;
          if (bPrio !== -1) return 1;
          return a.id.localeCompare(b.id);
        });

        return {
          provider: 'openrouter',
          isLive: true,
          count: orModels.length,
          models: orModels.length > 0 ? orModels : DEFAULT_MODELS.openrouter
        };
      }

      default:
        return { provider: prov, isLive: false, models: DEFAULT_MODELS.openai };
    }
  } catch (err) {
    console.warn(`[MultiProvider] Live model fetch failed for ${prov} (${err.message}). Using curated fallback.`);
    return {
      provider: prov,
      isLive: false,
      message: `Live fetch fallback: ${err.message}`,
      models: DEFAULT_MODELS[prov] || DEFAULT_MODELS.openai
    };
  }
}

/**
 * Sanitize AI output to guarantee strict compliance with user negative constraints
 */
function sanitizeReplyOutput(rawReply, styleInstruction = '', authorHandle = '', authorName = '') {
  if (!rawReply) return '';
  let reply = rawReply.trim();

  // 1. Strip wrapping quotes (double quotes, single quotes, backticks, smart quotes)
  reply = reply.replace(/^["'“`«»]+|["'”`«»]+$/g, '').trim();

  // 2. Strip any author @handles or usernames completely
  reply = reply.replace(/@[\w_]+/g, '').replace(/\s{2,}/g, ' ').trim();

  // 3. Strip author name/handle if mentioned without '@'
  if (authorHandle) {
    const cleanHandle = authorHandle.replace(/^@/, '').trim();
    if (cleanHandle.length >= 3) {
      const regHandle = new RegExp('\\b' + cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      reply = reply.replace(regHandle, '');
    }
  }
  if (authorName && authorName.trim().length >= 3) {
    const cleanName = authorName.trim();
    const regName = new RegExp('\\b' + cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    reply = reply.replace(regName, '');
  }

  // 4. Strip accidental prefixes like "Reply:", "Comment:", "Tweet:"
  reply = reply.replace(/^(Reply|Comment|Tweet|Response|AI Reply|Output)\s*:\s*/i, '').trim();

  // Again strip quotes in case prefix had quotes
  reply = reply.replace(/^["'“`«»]+|["'”`«»]+$/g, '').trim();

  // 5. If instruction explicitly forbids exclamation marks, replace '!' with '.'
  if (styleInstruction && /no exclamation marks?/i.test(styleInstruction)) {
    reply = reply.replace(/!+/g, '.');
  }

  // 6. If instruction specifies strict maximum word count (e.g. "Do not exceed 10 words")
  const maxWordMatch = styleInstruction.match(/Do not exceed (\d+) words/i) || styleInstruction.match(/between \d+ and (\d+) words/i);
  if (maxWordMatch) {
    const maxWords = parseInt(maxWordMatch[1], 10);
    const words = reply.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) {
      // Find a punctuation boundary or truncate cleanly
      reply = words.slice(0, maxWords).join(' ').replace(/[,;:\-\s]+$/, '') + '.';
    }
  }

  // 7. Clean up duplicate spaces and punctuation artifacts
  reply = reply.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();

  return reply;
}

/**
 * Resolve style instruction prioritizing user prompt above everything
 */
function resolveStyleInstruction(style, stylePrompt) {
  if (stylePrompt && stylePrompt.trim().length > 0) {
    return stylePrompt.trim();
  }

  if (!style) {
    return STYLE_GUIDELINES['Natural & Concise'];
  }

  // If style itself is a prompt (e.g. multi-line or contains prompt keywords or length > 25)
  if (style.includes('\n') || style.length > 25 || /CRITICAL|STRICTLY|Do not|Write a/i.test(style)) {
    return style.trim();
  }

  // Look up in toneStyles.json
  try {
    const tonePath = path.join(__dirname, '../data/toneStyles.json');
    if (fs.existsSync(tonePath)) {
      const toneData = JSON.parse(fs.readFileSync(tonePath, 'utf8'));
      const sLower = style.toLowerCase();
      const found = (toneData.defaultTones || []).find(t =>
        (t.id && t.id.toLowerCase() === sLower) ||
        (t.name && t.name.toLowerCase() === sLower) ||
        (t.id && (sLower.includes(t.id.toLowerCase()) || t.id.toLowerCase().includes(sLower))) ||
        (t.name && (sLower.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(sLower)))
      );
      if (found && found.prompt) {
        return found.prompt;
      }
    }
  } catch (e) {}

  // Look up in hardcoded STYLE_GUIDELINES
  if (STYLE_GUIDELINES[style]) {
    return STYLE_GUIDELINES[style];
  }

  // Default to style string itself if non-empty
  return style || STYLE_GUIDELINES['Natural & Concise'];
}

/**
 * Build unified system prompt and user content where the user's prompt is supreme
 */
function buildPromptMessages(tweetText, styleInstruction) {
  const systemPrompt = [
    "You are an AI assistant generating a single authentic reply to a social media post.",
    "CRITICAL CONSTRAINTS (HIGHEST PRIORITY - STRICT COMPLIANCE REQUIRED):",
    "1. ABSOLUTE COMPLIANCE: Obey every rule, length constraint, and formatting directive given below strictly and verbatim.",
    "2. NO AUTHOR NAMES OR USERNAMES: NEVER use or mention the post author's name, display name, or username. NEVER include any @handle or @username in your response.",
    "3. NO QUOTES: Output raw text only. NEVER wrap your reply in quotes (no \" or ' or “).",
    "4. NO AI EXPLANATIONS OR PREAMBLE: Output ONLY the exact single reply text itself, nothing else.",
    "",
    "USER INSTRUCTIONS & STYLE DIRECTIVES:",
    styleInstruction || "Write a casual, highly human, 1-2 sentence response."
  ].join('\n');

  const userContent = `Post Content:\n"""\n${tweetText}\n"""\n\nGenerate the reply now:`;

  return { systemPrompt, userContent };
}

/**
 * Generate AI reply using the specified provider and model
 */
async function generateWithProvider({
  provider = 'openai',
  model = null,
  tweetText,
  tweetAuthor = '@user',
  tweetAuthorName = '',
  style = 'Natural & Concise',
  stylePrompt = null,
  length = 'medium'
}) {
  const prov = (provider || 'openai').toLowerCase();
  const apiKey = getProviderKey(prov);
  const selectedModel = model || (DEFAULT_MODELS[prov]?.[0]?.id || 'gpt-4o-mini');

  const styleInstruction = resolveStyleInstruction(style, stylePrompt);
  const maxTokens = length === 'short' ? 45 : length === 'long' ? 140 : 80;

  // Real API execution if key exists
  if (apiKey && apiKey.length > 5) {
    try {
      const { systemPrompt, userContent } = buildPromptMessages(tweetText, styleInstruction);

      if (prov === 'gemini') {
        // Native Google Gemini generateContent call
        const geminiCleanModel = selectedModel.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiCleanModel}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `${systemPrompt}\n\n${userContent}` }
                ]
              }
            ],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.65
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          let reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          reply = sanitizeReplyOutput(reply, styleInstruction, tweetAuthor, tweetAuthorName);
          if (reply) {
            return {
              reply,
              provider: 'Google Gemini',
              modelUsed: selectedModel,
              tokensUsed: data.usageMetadata?.totalTokenCount || 50
            };
          }
        }
      } else {
        // OpenAI, Groq, and OpenRouter all use OpenAI-compatible Chat Completions
        let endpoint = 'https://api.openai.com/v1/chat/completions';
        let headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };

        if (prov === 'groq') {
          endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        } else if (prov === 'openrouter') {
          endpoint = 'https://openrouter.ai/api/v1/chat/completions';
          headers['HTTP-Referer'] = 'https://atomx.io';
          headers['X-Title'] = 'ATOMX ENGAGE';
        }

        const t0 = Date.now();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent }
            ],
            max_tokens: maxTokens,
            temperature: 0.65
          })
        });

        const latencyMs = Date.now() - t0;

        if (response.ok) {
          const data = await response.json();
          let reply = data.choices?.[0]?.message?.content?.trim() || '';
          reply = sanitizeReplyOutput(reply, styleInstruction, tweetAuthor, tweetAuthorName);
          if (reply) {
            addApiLog({
              provider: prov.toUpperCase(),
              model: data.model || selectedModel,
              status: 'SUCCESS',
              statusCode: 200,
              targetSnippet: tweetText,
              author: tweetAuthor,
              reply,
              latencyMs
            });
            return {
              reply,
              provider: prov.toUpperCase(),
              modelUsed: data.model || selectedModel,
              tokensUsed: data.usage?.total_tokens || 50
            };
          }
        } else {
          const errBody = await response.text();
          console.warn(`[MultiProvider] ${prov.toUpperCase()} returned ${response.status}:`, errBody);
          addApiLog({
            provider: prov.toUpperCase(),
            model: selectedModel,
            status: 'FAILED',
            statusCode: response.status,
            targetSnippet: tweetText,
            author: tweetAuthor,
            error: errBody.slice(0, 200),
            latencyMs
          });
        }
      }
    } catch (err) {
      console.warn(`[MultiProvider] Live call to ${prov} failed: ${err.message}.`);
      addApiLog({
        provider: prov.toUpperCase(),
        model: selectedModel,
        status: 'NETWORK_ERROR',
        statusCode: 500,
        targetSnippet: tweetText,
        author: tweetAuthor,
        error: err.message,
        latencyMs: 0
      });
    }
  }

  // FAILOVER CASCADE: If primary model/provider failed, attempt secondary working live provider
  const fallbackAttempts = [
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
    { provider: 'groq', model: 'allam-2-7b' },
    { provider: 'groq', model: 'qwen/qwen3.8-27b' }
  ];

  for (const fb of fallbackAttempts) {
    if (fb.provider === prov && fb.model === selectedModel) continue;
    const fbKey = getProviderKey(fb.provider);
    if (!fbKey) continue;

    try {
      let fbEndpoint = fb.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
      
      let fbHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fbKey}`
      };
      if (fb.provider === 'openrouter') {
        fbHeaders['HTTP-Referer'] = 'https://atomx.io';
        fbHeaders['X-Title'] = 'ATOMX ENGAGE';
      }

      const fbT0 = Date.now();
      const { systemPrompt, userContent } = buildPromptMessages(tweetText, styleInstruction);
      const fbRes = await fetch(fbEndpoint, {
        method: 'POST',
        headers: fbHeaders,
        body: JSON.stringify({
          model: fb.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          max_tokens: maxTokens,
          temperature: 0.65
        })
      });

      const fbLatency = Date.now() - fbT0;

      if (fbRes.ok) {
        const data = await fbRes.json();
        let reply = data.choices?.[0]?.message?.content?.trim() || '';
        reply = sanitizeReplyOutput(reply, styleInstruction, tweetAuthor, tweetAuthorName);
        if (reply) {
          addApiLog({
            provider: `${fb.provider.toUpperCase()} (Failover)`,
            model: fb.model,
            status: 'SUCCESS',
            statusCode: 200,
            targetSnippet: tweetText,
            author: tweetAuthor,
            reply,
            latencyMs: fbLatency
          });
          return {
            reply,
            provider: `${fb.provider.toUpperCase()} (Failover)`,
            modelUsed: fb.model,
            tokensUsed: data.usage?.total_tokens || 50
          };
        }
      } else {
        const errText = await fbRes.text();
        addApiLog({
          provider: `${fb.provider.toUpperCase()} (Failover)`,
          model: fb.model,
          status: 'FAILED',
          statusCode: fbRes.status,
          targetSnippet: tweetText,
          author: tweetAuthor,
          error: errText.slice(0, 150),
          latencyMs: fbLatency
        });
      }
    } catch (e) {
      // Continue to next failover option
    }
  }

  // Graceful synthesis engine tailored to the prompt instructions
  const fallback = createSynthesizedReply(tweetText, tweetAuthor, style, styleInstruction);
  addApiLog({
    provider: 'FALLBACK_SYNTHESIS',
    model: 'emergency-synthesized',
    status: 'FALLBACK',
    statusCode: 200,
    targetSnippet: tweetText,
    author: tweetAuthor,
    reply: fallback,
    error: 'All live API calls failed or exhausted'
  });

  return {
    reply: fallback,
    provider: `${prov.toUpperCase()} (Synthesized)`,
    modelUsed: selectedModel,
    tokensUsed: Math.round(fallback.length / 4) + 18
  };
}

function createSynthesizedReply(tweet, author, style, styleInstruction = '') {
  const cleanSnippet = tweet.replace(/https?:\/\/\S+/g, '').slice(0, 42).trim();
  const lowerPrompt = (styleInstruction || '').toLowerCase();

  // If user requested 5-10 words constraint or bullish constraint
  if (lowerPrompt.includes('5 and 10 words') || lowerPrompt.includes('bullish') || style === 'Bullish (5-10 words)') {
    const bullishVariations = [
      'Market momentum is strongly in our favor right now',
      'The upside potential here is looking better every day',
      'Strong execution and clear momentum building on this update',
      'High conviction on this project and the direction forward',
      'Solid progress and looking very promising for the future',
      'Really great vision and steady progress on this development'
    ];
    const picked = bullishVariations[Math.floor(Math.random() * bullishVariations.length)];
    return picked;
  }

  switch (style) {
    case 'Professional':
      return `A grounded perspective on "${cleanSnippet}...". Systematic execution and disciplined focus consistently separate category leaders from the rest.`;
    case 'Engaging Question':
      return `Spot on analysis regarding "${cleanSnippet}...". What primary leading indicator do you prioritize to validate this shift in practice?`;
    case 'Friendly':
      return `Completely agree with this! The nuance around "${cleanSnippet}..." is so often overlooked. Great share!`;
    case 'Witty':
      return `Simple lessons that take founders a decade to figure out: "${cleanSnippet}...".`;
    case 'Natural & Concise':
    default:
      return `Focused execution on "${cleanSnippet}..." is what really drives compounding returns.`;
  }
}

// Telemetry & API Key Health Testing Engine
const LOGS_FILE = path.join(__dirname, '../data/apiTelemetryLogs.json');
let recentApiLogs = [];

try {
  if (fs.existsSync(LOGS_FILE)) {
    recentApiLogs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  }
} catch (e) { recentApiLogs = []; }

function addApiLog(entry) {
  const logItem = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
    provider: entry.provider || 'unknown',
    model: entry.model || 'unknown',
    status: entry.status || 'SUCCESS',
    statusCode: entry.statusCode || 200,
    targetSnippet: (entry.targetSnippet || '').slice(0, 100),
    author: entry.author || '@user',
    reply: entry.reply || '',
    error: entry.error || null,
    latencyMs: entry.latencyMs || 0
  };

  recentApiLogs.unshift(logItem);
  if (recentApiLogs.length > 50) recentApiLogs = recentApiLogs.slice(0, 50);

  try {
    fs.mkdirSync(path.dirname(LOGS_FILE), { recursive: true });
    fs.writeFileSync(LOGS_FILE, JSON.stringify(recentApiLogs, null, 2), 'utf8');
  } catch (e) {}
}

function getApiLogs() {
  return recentApiLogs;
}

async function testAllProviderKeys() {
  const results = {};
  const providers = ['groq', 'openrouter', 'openai', 'gemini'];
  for (const p of providers) {
    const key = getProviderKey(p);
    if (!key || key.length < 5) {
      results[p] = { configured: false, status: 'MISSING_KEY', message: 'No API key set in .env' };
      continue;
    }
    try {
      const t0 = Date.now();
      let testEndpoint = '';
      let testHeaders = {};
      let testBody = null;

      if (p === 'groq') {
        testEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
        testHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        testBody = { model: 'qwen/qwen3.8-27b', messages: [{ role: 'user', content: 'hello' }], max_tokens: 5 };
      } else if (p === 'openrouter') {
        testEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
        testHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'HTTP-Referer': 'https://atomx.io' };
        testBody = { model: 'meta-llama/llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'hello' }], max_tokens: 5 };
      } else if (p === 'openai') {
        testEndpoint = 'https://api.openai.com/v1/chat/completions';
        testHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
        testBody = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }], max_tokens: 5 };
      } else if (p === 'gemini') {
        testEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
        testHeaders = { 'Content-Type': 'application/json' };
        testBody = { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };
      }

      const res = await fetch(testEndpoint, {
        method: 'POST',
        headers: testHeaders,
        body: JSON.stringify(testBody)
      });

      const latencyMs = Date.now() - t0;
      if (res.ok) {
        results[p] = { configured: true, status: 'HEALTHY', statusCode: res.status, latencyMs, message: `Active & Working (${latencyMs}ms)` };
      } else {
        const errText = await res.text();
        results[p] = { configured: true, status: 'ERROR', statusCode: res.status, latencyMs, message: `HTTP ${res.status}: ${errText.slice(0, 150)}` };
      }
    } catch (err) {
      results[p] = { configured: true, status: 'NETWORK_ERROR', message: err.message };
    }
  }
  return results;
}

module.exports = {
  DEFAULT_MODELS,
  fetchLiveModels,
  generateWithProvider,
  getProviderKey,
  getApiLogs,
  addApiLog,
  testAllProviderKeys
};

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
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Blazing Fast)', context: '128k' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (MoE Architecture)', context: '32k' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT (Google on Groq)', context: '8k' }
  ],
  openrouter: [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (State-of-the-Art)', context: '200k' },
    { id: 'openai/gpt-4o', name: 'GPT-4o via OpenRouter', context: '128k' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', context: '128k' },
    { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 via OpenRouter', context: '1M' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (High Efficiency)', context: '64k' }
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

  if (process.env[keyName] && process.env[keyName].trim().length > 5) {
    return process.env[keyName].trim();
  }

  // Check backend/.env directly
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

  if (!apiKey) {
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
        const groqModels = (data.data || [])
          .filter(m => m.active !== false)
          .map(m => ({
            id: m.id,
            name: `${m.id} (${m.owned_by || 'Groq'})`,
            context: m.context_window ? `${Math.round(m.context_window / 1000)}k` : '128k'
          }));

        return {
          provider: 'groq',
          isLive: true,
          count: groqModels.length,
          models: groqModels.length > 0 ? groqModels : DEFAULT_MODELS.groq
        };
      }

      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://atomx.io',
            'X-Title': 'ATOMX ENGAGE'
          }
        });
        if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
        const data = await res.json();
        const orModels = (data.data || [])
          .slice(0, 80) // Limit to top 80 models
          .map(m => ({
            id: m.id,
            name: m.name || m.id,
            context: m.context_length ? `${Math.round(m.context_length / 1000)}k` : 'Unknown',
            pricing: m.pricing?.prompt ? `$${(m.pricing.prompt * 1000000).toFixed(2)}/M` : 'Free'
          }));

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
 * Generate AI reply using the specified provider and model
 */
async function generateWithProvider({
  provider = 'openai',
  model = null,
  tweetText,
  tweetAuthor = '@user',
  style = 'Natural & Concise',
  stylePrompt = null,
  length = 'medium'
}) {
  const prov = (provider || 'openai').toLowerCase();
  const apiKey = getProviderKey(prov);
  const selectedModel = model || (DEFAULT_MODELS[prov]?.[0]?.id || 'gpt-4o-mini');

  let styleInstruction = stylePrompt;
  if (!styleInstruction) {
    try {
      const tonePath = path.join(__dirname, '../data/toneStyles.json');
      if (fs.existsSync(tonePath)) {
        const toneData = JSON.parse(fs.readFileSync(tonePath, 'utf8'));
        const found = (toneData.defaultTones || []).find(t =>
          (t.name && t.name.toLowerCase() === style.toLowerCase()) ||
          (t.id && t.id.toLowerCase() === style.toLowerCase())
        );
        if (found && found.prompt) {
          styleInstruction = found.prompt;
        }
      }
    } catch (e) {}
  }
  if (!styleInstruction) {
    styleInstruction = STYLE_GUIDELINES[style] || STYLE_GUIDELINES['Natural & Concise'];
  }
  const maxTokens = length === 'short' ? 45 : length === 'long' ? 140 : 80;

  // Real API execution if key exists
  if (apiKey && apiKey.length > 5) {
    try {
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
                  { text: `${SYSTEM_PROMPT_TEMPLATE}\nTone Style: ${styleInstruction}\nTarget Tweet by ${tweetAuthor}:\n"${tweetText}"\n\nGenerate the reply now:` }
                ]
              }
            ],
            generationConfig: {
              maxOutputTokens: maxTokens,
              temperature: 0.7
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
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

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: `${SYSTEM_PROMPT_TEMPLATE}\nTone Style: ${styleInstruction}` },
              { role: 'user', content: `Target Tweet by ${tweetAuthor}:\n"${tweetText}"\n\nGenerate reply:` }
            ],
            max_tokens: maxTokens,
            temperature: 0.72
          })
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content?.trim() || '';
          if (reply) {
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
        }
      }
    } catch (err) {
      console.warn(`[MultiProvider] Live call to ${prov} failed: ${err.message}. Using synthesis engine.`);
    }
  }

  // Graceful intelligent template engine when key is missing or quota exhausted
  const fallback = createSynthesizedReply(tweetText, tweetAuthor, style);
  return {
    reply: fallback,
    provider: `${prov.toUpperCase()} (Synthesized)`,
    modelUsed: selectedModel,
    tokensUsed: Math.round(fallback.length / 4) + 18
  };
}

function createSynthesizedReply(tweet, author, style) {
  const cleanSnippet = tweet.replace(/https?:\/\/\S+/g, '').slice(0, 42).trim();

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
      return `Compounding focus on "${cleanSnippet}..." is the real unlock here. Solid breakdown.`;
  }
}

module.exports = {
  DEFAULT_MODELS,
  fetchLiveModels,
  generateWithProvider,
  getProviderKey
};

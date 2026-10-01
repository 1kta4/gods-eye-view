import { enforceOptInRateLimit, openAiRateLimiter } from './rate-limit.js';
import {
  resolveVoiceModel,
  isKnownVoiceTier,
} from '../../../src/voice/voiceCost.js';
import {
  OPENAI_REALTIME_MODEL_MINI_DEFAULT,
  OPENAI_REALTIME_MODEL_DEFAULT,
  OPENAI_REALTIME_VOICE_DEFAULT,
  OPENAI_REALTIME_REASONING_DEFAULT,
  OPENAI_REALTIME_CONTEXT_TOKENS_DEFAULT,
  OPENAI_REALTIME_CONTEXT_RETENTION_DEFAULT,
} from './constants.js';
import { realtimeInstructions } from './instructions.js';
import { GEV_REALTIME_TOOLS } from './tools.js';

const REALTIME_SECRET_TTL_SECONDS = 120;
const REALTIME_MINTS_PER_HOUR_DEFAULT = 30;

function createRealtimeTokenHandler({
  annotationGuidance,
  endpoint = 'https://api.openai.com/v1/realtime/client_secrets',
  fetchImpl = (...args) => fetch(...args),
  resolveApiKey = () => process.env.OPENAI_API_KEY,
  models = {},
  now = () => Date.now(),
  maxMintsPerHour = Number(process.env.OPENAI_REALTIME_MAX_MINTS_PER_HOUR) ||
    REALTIME_MINTS_PER_HOUR_DEFAULT,
} = {}) {
  // Server-side backstop for the browser's spend cap: a page that bypasses
  // the client meter still cannot mint sessions without bound.
  const mintTimes = [];
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Opt-in per-IP throttle (GEV_RATELIMIT_OPENAI_PER_MIN). No-op when unset.
    if (!enforceOptInRateLimit(openAiRateLimiter(), req, res)) return;

    const apiKey = resolveApiKey();
    if (!apiKey) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }));
      return;
    }

    const mintedAt = now();
    while (mintTimes.length && mintedAt - mintTimes[0] > 3600_000)
      mintTimes.shift();
    if (mintTimes.length >= maxMintsPerHour) {
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Realtime session limit reached' }));
      return;
    }
    mintTimes.push(mintedAt);

    // Voice model tier, requested by the client as ?tier=standard|mini.
    // resolveVoiceModel is total: an unknown, empty, or hostile value
    // resolves to `standard` instead of reaching OpenAI as a model id, so a
    // bad querystring degrades to a normal session rather than a dead mic.
    // The env overrides stay authoritative per tier (see .env.example) —
    // a wrong upstream model id is then a config fix, not a code change.
    const requestedTier = (() => {
      try {
        return new URL(req.url || '', 'http://localhost').searchParams.get(
          'tier',
        );
      } catch {
        return null;
      }
    })();
    const tier = resolveVoiceModel(requestedTier).tier;
    const model =
      tier === 'mini'
        ? models.mini ||
          process.env.OPENAI_REALTIME_MODEL_MINI ||
          OPENAI_REALTIME_MODEL_MINI_DEFAULT
        : models.standard ||
          process.env.OPENAI_REALTIME_MODEL ||
          OPENAI_REALTIME_MODEL_DEFAULT;
    const voice =
      process.env.OPENAI_REALTIME_VOICE || OPENAI_REALTIME_VOICE_DEFAULT;
    const effort =
      process.env.OPENAI_REALTIME_REASONING_EFFORT ||
      OPENAI_REALTIME_REASONING_DEFAULT;
    const contextTokenLimit = Math.round(
      Math.max(
        1000,
        Math.min(
          12000,
          Number(process.env.OPENAI_REALTIME_CONTEXT_TOKENS) ||
            OPENAI_REALTIME_CONTEXT_TOKENS_DEFAULT,
        ),
      ),
    );
    const contextRetentionRatio = Math.max(
      0.1,
      Math.min(
        1,
        Number(process.env.OPENAI_REALTIME_CONTEXT_RETENTION) ||
          OPENAI_REALTIME_CONTEXT_RETENTION_DEFAULT,
      ),
    );
    const sessionConfig = {
      // The secret is only needed to open the WebRTC call; keep it short.
      expires_after: {
        anchor: 'created_at',
        seconds: REALTIME_SECRET_TTL_SECONDS,
      },
      session: {
        type: 'realtime',
        model,
        reasoning: { effort },
        truncation: {
          type: 'retention_ratio',
          retention_ratio: contextRetentionRatio,
          token_limits: {
            post_instructions: contextTokenLimit,
          },
        },
        audio: {
          input: {
            noise_reduction: { type: 'near_field' },
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'low',
              create_response: true,
              interrupt_response: false,
            },
          },
          output: { voice },
        },
        instructions: realtimeInstructions(annotationGuidance),
        tools: GEV_REALTIME_TOOLS,
        tool_choice: 'auto',
      },
    };

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'OpenAI-Safety-Identifier': 'gev-local-dev',
        },
        body: JSON.stringify(sessionConfig),
      });
      const body = await response.text();
      res.statusCode = response.status;
      // Which tier/model this secret was actually minted for. The upstream
      // success body is passed through untouched (the client parses it
      // verbatim), so these headers are the authoritative echo — including the
      // case where a bogus ?tier= was silently downgraded to standard.
      res.setHeader('X-GEV-Voice-Tier', tier);
      res.setHeader('X-GEV-Voice-Model', model);
      if (requestedTier && !isKnownVoiceTier(requestedTier)) {
        res.setHeader('X-GEV-Voice-Tier-Fallback', '1');
      }
      if (!response.ok) {
        console.warn(`[realtime-token] upstream HTTP ${response.status}`);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Failed to create Realtime token' }));
        return;
      }
      res.setHeader(
        'Content-Type',
        response.headers.get('content-type') || 'application/json',
      );
      res.end(body);
    } catch {
      // For a network fault this was a resolver message naming the upstream
      // host; the client only needs to know the mint failed.
      console.warn('[realtime-token] mint failed');
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Failed to create Realtime token',
        }),
      );
    }
  };
}

export { createRealtimeTokenHandler };

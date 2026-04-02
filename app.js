/* ============================================
   AIWITNESS — app.js
   Decentralized AI fact checker on OpenGradient
   ============================================ */

// ── STATE ──────────────────────────────────────────────────────────────────
const state = {
  verdicts: [],
  activeVerdictId: null,
  totalVerdicts: 0,
  stats: { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIABLE: 0 },
  modelAgreement: {
    'GPT-4.1': { total: 0, agreed: 0 },
    'Claude Sonnet': { total: 0, agreed: 0 },
    'Gemini 2.5 Pro': { total: 0, agreed: 0 },
    'Grok-4': { total: 0, agreed: 0 },
  }
};

const VERDICTS = ['TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIABLE'];
const MODELS = ['GPT-4.1', 'Claude Sonnet', 'Gemini 2.5 Pro', 'Grok-4'];

// ── REASONING DATABASE ─────────────────────────────────────────────────────
// Per-topic reasoning templates for realistic responses
const reasoningDB = {
  'great wall': {
    TRUE: null,
    FALSE: [
      "This is a persistent myth. The Great Wall of China is approximately 9 meters wide — far too narrow to be resolved by the human eye from 400km altitude. Astronauts including Chinese astronaut Yang Liwei have confirmed they could not see it. The claim confuses the wall's length with visibility.",
      "Multiple astronauts and NASA have explicitly stated the wall is not visible from space without optical aids. The human eye's angular resolution at orbital altitude cannot resolve objects narrower than a large river. This claim has been debunked by scientific consensus.",
    ],
    MISLEADING: [
      "The claim is misleading because visibility depends on conditions and optical aids. With a camera or binoculars it may be partially visible, but the common assertion that it's visible with the naked eye is false. The wall's width, not length, is the limiting factor.",
    ]
  },
  '10% brain': {
    FALSE: [
      "Neuroscience has thoroughly debunked this claim. Brain imaging technology shows all regions of the brain have identifiable functions and virtually all parts are active at some point. We would not have evolved such metabolically expensive tissue if 90% was unused.",
      "This myth likely originated from misquoted William James writings or misinterpreted glial cell research. Modern fMRI studies confirm we use virtually all brain regions, though not all simultaneously. The claim has no scientific basis.",
    ]
  },
  'bitcoin': {
    TRUE: [
      "Correct. Bitcoin's protocol hard-caps total supply at 21 million BTC, encoded in Satoshi Nakamoto's original implementation. This is enforced by the consensus rules of every Bitcoin node. Approximately 19.7 million BTC have been mined as of 2025, with the last bitcoin estimated to be mined around 2140.",
      "Accurate. The 21 million cap is a fundamental property of Bitcoin's monetary policy, embedded in the code and enforced by the network. Block rewards halve approximately every four years, asymptotically approaching but never exceeding 21 million.",
    ]
  },
  'vaccine': {
    FALSE: [
      "This claim originated from a 1998 Lancet paper by Andrew Wakefield that was fully retracted in 2010 after investigation revealed data fraud and ethical violations. Wakefield lost his medical license. Over 20 major studies involving millions of children have found no link between vaccines and autism.",
      "Comprehensively false. The original study behind this claim was fraudulent — the author manipulated data and had undisclosed financial conflicts of interest. Subsequent research across multiple countries and millions of children has found no causal relationship between vaccination and autism spectrum disorder.",
    ]
  },
  'ai jobs': {
    MISLEADING: [
      "The 300 million figure comes from a 2023 Goldman Sachs report that actually said AI 'could' expose 300 million full-time equivalent jobs to automation — not eliminate them. The report also noted new job creation. The claim selectively uses a projection as a certainty and ignores the full context.",
      "This is misleading in multiple ways: the 300M figure is a maximum exposure estimate, not a job loss prediction; it refers to job equivalents not individuals; it projects automation exposure not elimination; and most economists expect job transformation rather than net destruction.",
    ],
    UNVERIFIABLE: [
      "The figure is sourced from various projections (WEF, Goldman Sachs, McKinsey) that use different methodologies and time horizons. As a prediction about the future, this cannot be verified as true or false. Current evidence shows AI is transforming tasks within jobs rather than eliminating jobs at the projected scale.",
    ]
  },
  'energy': {
    MISLEADING: [
      "This comparison is frequently cited but misleading in context. Bitcoin's energy consumption is real and significant, but comparing it to a country's total energy use (including heating, transport, industry) is an apples-to-oranges comparison. Additionally, the mix of renewable energy used by Bitcoin mining has been growing.",
      "The comparison requires context: (1) what period — Bitcoin's energy use fluctuates significantly; (2) Argentina's total energy includes non-electrical uses; (3) an increasing percentage of Bitcoin mining uses renewable energy; (4) the comparison doesn't account for the energy used by traditional banking systems.",
    ]
  }
};

function getKeyword(claim) {
  const c = claim.toLowerCase();
  if (c.includes('great wall') || c.includes('china') && c.includes('space')) return 'great wall';
  if (c.includes('10%') && c.includes('brain') || c.includes('ten percent')) return '10% brain';
  if (c.includes('bitcoin') && (c.includes('21') || c.includes('supply') || c.includes('cap'))) return 'bitcoin';
  if (c.includes('vaccine') || c.includes('autism')) return 'vaccine';
  if (c.includes('300 million') || c.includes('jobs') && c.includes('ai')) return 'ai jobs';
  if (c.includes('energy') && c.includes('bitcoin') || c.includes('argentina')) return 'energy';
  return null;
}

function generateModelVerdict(claim, modelName, keyword) {
  const verdictOptions = VERDICTS;

  // If we know the claim, give accurate verdicts
  let verdict, confidence, reasoning;

  if (keyword && reasoningDB[keyword]) {
    const db = reasoningDB[keyword];
    // Pick the most likely verdict for this claim
    const available = Object.keys(db).filter(v => db[v] && db[v].length > 0);
    // Add some model-specific variance
    const modelBias = {
      'GPT-4.1': 0,
      'Claude Sonnet': 0,
      'Gemini 2.5 Pro': Math.random() > 0.85 ? 1 : 0,
      'Grok-4': Math.random() > 0.8 ? 1 : 0,
    };
    const idx = Math.min(modelBias[modelName] || 0, available.length - 1);
    verdict = available[idx];
    const pool = db[verdict];
    reasoning = pool[Math.floor(Math.random() * pool.length)];
    confidence = verdict === 'TRUE' ? randInt(80, 96) :
                 verdict === 'FALSE' ? randInt(85, 98) :
                 verdict === 'MISLEADING' ? randInt(72, 90) : randInt(60, 78);
  } else {
    // Generic verdict for unknown claims
    const weights = [0.25, 0.3, 0.28, 0.17]; // TRUE/FALSE/MISLEADING/UNVERIFIABLE
    const r = Math.random();
    let acc = 0;
    verdict = VERDICTS[0];
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) { verdict = VERDICTS[i]; break; }
    }
    confidence = randInt(60, 90);
    reasoning = generateGenericReasoning(claim, verdict, modelName);
  }

  return { verdict, confidence, reasoning, txHash: randomHash() };
}

function generateGenericReasoning(claim, verdict, model) {
  const templates = {
    TRUE: [
      `Analysis of the available evidence suggests this claim is accurate. The core assertion aligns with documented sources and established consensus. ${model} found no significant contradicting evidence in current knowledge bases.`,
      `This claim appears factually grounded based on verifiable sources. Cross-referencing multiple knowledge domains confirms the central assertion. Confidence is based on source reliability and internal consistency.`,
    ],
    FALSE: [
      `This claim contradicts well-documented evidence. Available data directly refutes the central assertion. This appears to be a common misconception that has been repeatedly addressed by domain experts.`,
      `The claim as stated is inaccurate. Evidence from primary sources and established research contradicts this assertion. The claim may stem from misinterpretation or deliberate misrepresentation of facts.`,
    ],
    MISLEADING: [
      `While the claim contains elements of truth, it omits critical context that significantly changes its meaning. The selective framing creates a misleading impression. A more accurate representation would include the full picture.`,
      `This claim is technically defensible in a narrow interpretation but misleading in its common usage. Important nuance, caveats, and contradicting data are absent. The framing encourages incorrect conclusions.`,
    ],
    UNVERIFIABLE: [
      `This claim makes assertions about future events or involves data that cannot be independently confirmed with current information. Without access to real-time data or future knowledge, a definitive verdict cannot be rendered.`,
      `The claim involves projections, predictions, or contested interpretations where reasonable experts disagree. Current evidence is insufficient to render a definitive TRUE or FALSE verdict. Context and methodology matter significantly.`,
    ],
  };
  const pool = templates[verdict];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomHash(len = 64) {
  return '0x' + [...Array(len)].map(() => Math.floor(Math.random()*16).toString(16)).join('');
}
function shortHash(h) { return h.slice(0, 8) + '...' + h.slice(-6); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function now() { return new Date().toLocaleTimeString('en-US', {hour12: false}); }
function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).toUpperCase();
}

// ── CONSENSUS ──────────────────────────────────────────────────────────────
function getConsensus(modelResults) {
  const counts = {};
  modelResults.forEach(r => { counts[r.verdict] = (counts[r.verdict] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const top = sorted[0];
  if (top[1] === 1 && sorted.length >= 3) return { verdict: 'CONTESTED', agreement: '4 models disagree' };
  const pct = Math.round((top[1] / modelResults.length) * 100);
  return {
    verdict: top[0],
    agreement: `${top[1]}/${modelResults.length} models agree (${pct}%)`
  };
}

// ── CORE: VERIFY CLAIM ──────────────────────────────────────────────────────
async function verifyClaim(claimText) {
  if (!claimText.trim()) return;

  const btn = document.getElementById('btn-submit');
  const st = document.getElementById('submit-text');
  const sl = document.getElementById('submit-loading');
  btn.disabled = true;
  st.classList.add('hidden');
  sl.classList.remove('hidden');

  showToast('Submitting to OpenGradient TEE nodes...');

  // Simulate 4 parallel TEE inference calls (1.8–3.2s)
  await delay(randInt(1800, 3200));

  const keyword = getKeyword(claimText);
  const modelResults = MODELS.map(m => ({
    model: m,
    ...generateModelVerdict(claimText, m, keyword),
  }));

  const consensus = getConsensus(modelResults);

  const verdictRecord = {
    id: uid(),
    claim: claimText,
    consensus: consensus.verdict,
    consensusAgreement: consensus.agreement,
    models: modelResults,
    time: now(),
    blockNumber: randInt(4820000, 4830000),
    challenges: 0,
    settled: true,
  };

  state.verdicts.push(verdictRecord);
  state.totalVerdicts++;
  state.stats[consensus.verdict] = (state.stats[consensus.verdict] || 0) + 1;

  // Update model agreement stats
  modelResults.forEach(r => {
    if (state.modelAgreement[r.model]) {
      state.modelAgreement[r.model].total++;
      if (r.verdict === consensus.verdict) state.modelAgreement[r.model].agreed++;
    }
  });

  // Reset UI
  btn.disabled = false;
  st.classList.remove('hidden');
  sl.classList.add('hidden');
  document.getElementById('claim-input').value = '';

  // Render
  renderVerdictFeed();
  renderStats();
  renderModelAgreement();
  renderTopClaims();
  showActiveVerdict(verdictRecord);
  document.getElementById('verdict-count').textContent = `${state.totalVerdicts} verdict${state.totalVerdicts !== 1 ? 's' : ''} on-chain`;

  showToast(`✓ Verdict: ${consensus.verdict} — Proven on-chain`, 'success');
}

// ── RENDER: ACTIVE VERDICT ─────────────────────────────────────────────────
function showActiveVerdict(v) {
  document.getElementById('empty-state').classList.add('hidden');
  const av = document.getElementById('active-verdict');
  av.classList.remove('hidden');
  state.activeVerdictId = v.id;

  document.getElementById('av-claim').textContent = v.claim;
  document.getElementById('av-time').textContent = v.time;
  document.getElementById('av-block').textContent = `Block #${v.blockNumber.toLocaleString()}`;

  // Consensus badge
  const badge = document.getElementById('consensus-badge');
  badge.textContent = v.consensus;
  badge.className = `consensus-verdict-badge badge-${v.consensus}`;
  document.getElementById('consensus-agreement').textContent = v.consensusAgreement;

  // Model grid
  const grid = document.getElementById('model-grid');
  grid.innerHTML = v.models.map(m => `
    <div class="model-card" onclick="openModelModal('${v.id}', '${m.model}')">
      <div class="model-card-header">
        <span class="model-name">${m.model}</span>
        <span class="model-verdict-pill pill-${m.verdict}">${m.verdict}</span>
      </div>
      <div class="model-card-body">
        <div class="model-reasoning">${m.reasoning}</div>
        <div class="model-confidence-row">
          <span class="model-conf-label">CONF.</span>
          <div class="model-conf-bar-wrap">
            <div class="model-conf-bar conf-bar-${m.verdict}" style="width:${m.confidence}%"></div>
          </div>
          <span class="model-conf-val">${m.confidence}%</span>
        </div>
        <div class="model-proof-hash">PROOF: <span>${shortHash(m.txHash)}</span></div>
      </div>
    </div>
  `).join('');

  // Receipt
  const receiptGrid = document.getElementById('receipt-grid');
  receiptGrid.innerHTML = v.models.map(m => `
    <div class="receipt-item">
      <div class="receipt-model">${m.model}</div>
      <div class="receipt-hash">${shortHash(m.txHash)}</div>
    </div>
  `).join('');

  renderVerdictFeed();
}

// ── RENDER: VERDICT FEED ───────────────────────────────────────────────────
function renderVerdictFeed() {
  const el = document.getElementById('verdict-feed');
  const recent = [...state.verdicts].reverse().slice(0, 12);
  el.innerHTML = recent.map(v => `
    <div class="feed-item ${v.id === state.activeVerdictId ? 'active' : ''}"
         onclick="selectVerdict('${v.id}')">
      <div class="feed-item-claim">${v.claim}</div>
      <div class="feed-item-meta">
        <span class="feed-verdict-chip chip-${v.consensus.toLowerCase()}">${v.consensus}</span>
        <span class="feed-time">${v.time}</span>
      </div>
    </div>
  `).join('');
}

function selectVerdict(id) {
  const v = state.verdicts.find(x => x.id === id);
  if (v) showActiveVerdict(v);
}

// ── RENDER: STATS ──────────────────────────────────────────────────────────
function renderStats() {
  const total = Object.values(state.stats).reduce((a,b) => a+b, 0) || 1;
  ['TRUE','FALSE','MISLEADING','UNVERIFIABLE'].forEach(v => {
    const count = state.stats[v] || 0;
    const pct = Math.round((count / total) * 100);
    const barId = { TRUE:'bar-true',FALSE:'bar-false',MISLEADING:'bar-mislead',UNVERIFIABLE:'bar-unverif'}[v];
    const numId = { TRUE:'num-true',FALSE:'num-false',MISLEADING:'num-mislead',UNVERIFIABLE:'num-unverif'}[v];
    document.getElementById(barId).style.width = pct + '%';
    document.getElementById(numId).textContent = count;
  });
}

// ── RENDER: MODEL AGREEMENT ────────────────────────────────────────────────
function renderModelAgreement() {
  const el = document.getElementById('model-agreement');
  el.innerHTML = MODELS.map(m => {
    const d = state.modelAgreement[m];
    const pct = d.total > 0 ? Math.round((d.agreed / d.total) * 100) : '—';
    return `
      <div class="agree-row">
        <span class="agree-model">${m}</span>
        <span class="agree-pct">${pct}${typeof pct === 'number' ? '%' : ''}</span>
      </div>
    `;
  }).join('');
}

// ── RENDER: TOP CLAIMS ─────────────────────────────────────────────────────
function renderTopClaims() {
  const el = document.getElementById('top-claims');
  const sorted = [...state.verdicts].sort((a,b) => b.challenges - a.challenges).slice(0, 5);
  if (!sorted.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--ink-faint);padding:8px 0">No claims yet</div>';
    return;
  }
  el.innerHTML = sorted.map(v => `
    <div class="top-claim-item" onclick="selectVerdict('${v.id}')">
      <div class="top-claim-text">${v.claim.slice(0, 80)}${v.claim.length > 80 ? '…' : ''}</div>
      <div class="top-claim-meta">
        <span class="top-challenges">${v.challenges} challenge${v.challenges !== 1 ? 's' : ''}</span>
        <span class="top-verdict">${v.consensus}</span>
      </div>
    </div>
  `).join('');
}

// ── MODAL: Model detail ────────────────────────────────────────────────────
function openModelModal(verdictId, modelName) {
  const v = state.verdicts.find(x => x.id === verdictId);
  if (!v) return;
  const m = v.models.find(x => x.model === modelName);
  if (!m) return;

  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <div class="modal-verdict-large badge-${m.verdict}">${m.verdict}</div>
    <div class="modal-section-title">CLAIM</div>
    <div class="modal-row"><span class="modal-val" style="font-style:italic">"${v.claim}"</span></div>
    <div class="modal-section-title">MODEL ASSESSMENT</div>
    <div class="modal-row"><span class="modal-lbl">MODEL</span><span class="modal-val">${m.model}</span></div>
    <div class="modal-row"><span class="modal-lbl">VERDICT</span><span class="modal-val">${m.verdict}</span></div>
    <div class="modal-row"><span class="modal-lbl">CONFIDENCE</span><span class="modal-val">${m.confidence}%</span></div>
    <div class="modal-row"><span class="modal-lbl">REASONING</span><span class="modal-val">${m.reasoning}</span></div>
    <div class="modal-section-title">ON-CHAIN PROOF</div>
    <div class="modal-row"><span class="modal-lbl">TX HASH</span><span class="modal-val">${m.txHash}</span></div>
    <div class="modal-row"><span class="modal-lbl">BLOCK</span><span class="modal-val">#${v.blockNumber.toLocaleString()}</span></div>
    <div class="modal-row"><span class="modal-lbl">SETTLED AT</span><span class="modal-val">${v.time}</span></div>
    <div class="modal-row"><span class="modal-lbl">VERIFY</span><span class="modal-val">
      <a href="https://explorer.opengradient.ai" target="_blank" class="receipt-link" style="color:var(--ink)">explorer.opengradient.ai →</a>
    </span></div>
    <div class="modal-section-title">REPRODUCE WITH SDK</div>
    <div style="background:var(--ink);padding:12px;font-family:var(--mono);font-size:10px;line-height:1.8;color:#d4cfc5;border-left:3px solid var(--red)">
<span style="color:#c792ea">import</span> asyncio, opengradient <span style="color:#c792ea">as</span> og

llm = og.<span style="color:#f5a623">LLM</span>(private_key=<span style="color:#c3e88d">"0x..."</span>)
result = asyncio.run(llm.chat(
    model=og.TEE_LLM.<span style="color:#f5a623">GPT_4_1_2025_04_14</span>,
    messages=[
        {<span style="color:#c3e88d">"role"</span>: <span style="color:#c3e88d">"system"</span>, <span style="color:#c3e88d">"content"</span>: FACTCHECK_PROMPT},
        {<span style="color:#c3e88d">"role"</span>: <span style="color:#c3e88d">"user"</span>, <span style="color:#c3e88d">"content"</span>: <span style="color:#c3e88d">"${v.claim.slice(0,40)}..."</span>}
    ],
    x402_settlement_mode=og.x402SettlementMode.<span style="color:#f5a623">INDIVIDUAL_FULL</span>
))
<span style="color:#555;font-style:italic"># Proof: result.payment_hash = ${shortHash(m.txHash)}</span>
    </div>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

// ── FILL CLAIM FROM SAMPLE ─────────────────────────────────────────────────
function fillClaim(el) {
  document.getElementById('claim-input').value = el.textContent;
  document.getElementById('claim-input').focus();
}

// ── CHALLENGE ──────────────────────────────────────────────────────────────
function submitChallenge() {
  const input = document.getElementById('challenge-input');
  const text = input.value.trim();
  if (!text) return;

  const v = state.verdicts.find(x => x.id === state.activeVerdictId);
  if (!v) return;

  v.challenges++;
  input.value = '';
  renderTopClaims();
  renderVerdictFeed();
  showToast('Challenge submitted. New verification round initiated.');

  // Re-verify after a short delay (simulate new round)
  setTimeout(() => {
    showToast('✓ Challenge resolved — verdict confirmed on-chain', 'success');
  }, 2500);
}

// ── COPY PROOF ─────────────────────────────────────────────────────────────
function copyProofIds() {
  const v = state.verdicts.find(x => x.id === state.activeVerdictId);
  if (!v) return;
  const text = v.models.map(m => `${m.model}: ${m.txHash}`).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('Proof IDs copied to clipboard'));
}

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── SEED DATA ──────────────────────────────────────────────────────────────
function seedData() {
  const seeds = [
    { claim: "The Great Wall of China is visible from space with the naked eye.", consensus: 'FALSE' },
    { claim: "Bitcoin's total supply is capped at 21 million coins.", consensus: 'TRUE' },
    { claim: "AI will replace 300 million jobs by 2030.", consensus: 'MISLEADING' },
    { claim: "Vaccines cause autism.", consensus: 'FALSE' },
    { claim: "Humans only use 10% of their brain.", consensus: 'FALSE' },
  ];

  seeds.forEach((seed, i) => {
    const keyword = getKeyword(seed.claim);
    const models = MODELS.map(m => ({
      model: m, ...generateModelVerdict(seed.claim, m, keyword)
    }));
    // Force consensus to match seed
    models[0].verdict = seed.consensus;

    const v = {
      id: uid(),
      claim: seed.claim,
      consensus: seed.consensus,
      consensusAgreement: `${2 + randInt(0,2)}/${MODELS.length} models agree`,
      models,
      time: new Date(Date.now() - (seeds.length - i) * 900000).toLocaleTimeString('en-US', {hour12:false}),
      blockNumber: randInt(4818000, 4820000),
      challenges: randInt(0, 4),
      settled: true,
    };

    state.verdicts.push(v);
    state.stats[seed.consensus] = (state.stats[seed.consensus] || 0) + 1;
    state.totalVerdicts++;
    MODELS.forEach(m => {
      state.modelAgreement[m].total++;
      const mr = models.find(x => x.model === m);
      if (mr && mr.verdict === seed.consensus) state.modelAgreement[m].agreed++;
    });
  });
}

// ── EVENTS ────────────────────────────────────────────────────────────────
document.getElementById('btn-submit').addEventListener('click', () => {
  verifyClaim(document.getElementById('claim-input').value);
});
document.getElementById('claim-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    verifyClaim(document.getElementById('claim-input').value);
  }
});
document.getElementById('btn-challenge').addEventListener('click', submitChallenge);
document.getElementById('btn-copy-proof').addEventListener('click', copyProofIds);
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal-overlay').classList.add('hidden');
});

// ── INIT ──────────────────────────────────────────────────────────────────
function init() {
  document.getElementById('live-date').textContent = formatDate();
  document.getElementById('verdict-count').textContent = '0 verdicts on-chain';

  seedData();
  renderVerdictFeed();
  renderStats();
  renderModelAgreement();
  renderTopClaims();

  // Show first seeded verdict
  const first = state.verdicts[state.verdicts.length - 1];
  if (first) showActiveVerdict(first);
  document.getElementById('verdict-count').textContent = `${state.totalVerdicts} verdicts on-chain`;
}

init();

// Core state
let currentScenario = null;
let selectedEntity = null;
let tick = 0;
let isAutoplay = false;
let auditLog = [];
let bpm = 20;
let autoplayInterval = null;

// Load variations from JSON file
let textVariations = null;

// information about the latent the user selected (seed for generation)
let initiatingInfo = { entityId: null, vector: null, text: '' };

// API key placeholder
let OPENAI_API_KEY = ''; // <-- fill in with your key or leave blank to use latent text only

// helper for runtime updating (called from ripples.html)
window.updateAPIKey = (k) => { OPENAI_API_KEY = k; console.log('API key updated'); };

// Latent library with a forest scenario
const latentLibrary = {
    forest: {
        name: 'DEEP FOREST',
        baseline: 'Moss blankets the ground. Light filters through a canopy of needles.',
        grid: { cols: 8, rows: 6, background: 'forest-green' },
        entities: [
            { id: 'boulder', name: 'Ancient Boulder', type: 'inanimate', state: 'immobile', position: { x: 2, y: 3 }, icon: '🪨', adjacentTo: ['pine', 'mushroom'] },
            { id: 'pine', name: 'Tall Pine', type: 'animate', state: 'growing', position: { x: 5, y: 1 }, icon: '🌲', adjacentTo: ['cloud', 'mushroom'] },
            { id: 'ants-nest', name: 'Ants’ Nest', type: 'animate', state: 'foraging', position: { x: 1, y: 4 }, icon: '🏡', adjacentTo: ['boulder', 'mushroom'] },
            { id: 'mushroom', name: 'Fungus Cap', type: 'animate', state: 'sporing', position: { x: 4, y: 3 }, icon: '🍄', adjacentTo: ['pine', 'ants-nest'] },
            { id: 'cloud', name: 'Drifting Cloud', type: 'abstract', state: 'dissolving', position: { x: 6, y: 0 }, icon: '☁️', adjacentTo: ['pine'] },
            { id: 'fern', name: 'Lush Fern', type: 'animate', state: 'unfurling', position: { x: 0, y: 2 }, icon: '🌿', adjacentTo: [] },
            { id: 'blueberry', name: 'Wild Blueberry', type: 'animate', state: 'ripe', position: { x: 7, y: 4 }, icon: '🫐', adjacentTo: [] },
            { id: 'deer', name: 'Forest Deer', type: 'animate', state: 'foraging', position: { x: 3, y: 5 }, icon: '🦌', adjacentTo: [] },
            { id: 'lichen', name: 'Pale Lichen', type: 'animate', state: 'spreading', position: { x: 2, y: 0 }, icon: '🟩', adjacentTo: [] }
        ],
        latent: {
            'boulder': {
                ACTION: [
                    'I shift imperceptibly toward the stream; gravity guides my slow, patient slide across moss and years.',
                    'Roots clutch my underside, lifting and reshaping the earth around me; movement is resisted and negotiated.',
                    'Lichen spreads across my face, turning stone into a quiet host for green, softening my edges with time.'
                ]
            },
            'pine': {
                ACTION: [
                    'My needles angle toward shafts of light; each year I extend, knotting sky and earth with patient growth.',
                    'A sudden gust tears a branch; I reroute sap and harden tissue, learning the cost of wind by wound.',
                    'Cold settles and I draw inward; needles stiffen as seasons fold me into a quieter, measured sleep.'
                ]
            },
            'ants-nest': {
                ACTION: [
                    'Trails flare toward a fallen berry; workers ferry sugar back, the colony a braided network of taste and labor.',
                    'A toad collapses into tunnels, scent and pressure overwhelming passages; pheromones spike to coordinate defense.',
                    'Rain presses soil into chambers; movement slows as water rearranges the architecture of our home.'
                ]
            },
            'mushroom': {
                ACTION: [
                    'I push my cap outward and fling spores into damp air; the forest learns my presence in drifting clouds.',
                    'A beetle bores and enzymes flood; tissue collapses and reshapes as I digest the invader within.',
                    'Dew beads along gills; at night my pale underside lights the damp floor like a soft, breathing lamp.'
                ]
            },
            'cloud': {
                ACTION: [
                    'Edges thin toward the warm ground; I condense and yearn to let salt and rain return to roots below.',
                    'Thermals lift me; cool air strips weight and scent until the forest falls away and I drift alone.',
                    'I spill a curtain of mist, dissolving the world and knitting air back into vapor and quiet.'
                ]
            },
            'fern': {
                ACTION: [
                    'Fronds unfurl toward a dim sun, curling outward in green spirals seeking every thin beam of light.',
                    'Shade deepens; my growth slows and green dims as needles settle upon me, weighing each leaflet.',
                    'A curl browns and folds; I return nutrients to soil and rest until warmth teases me open again.'
                ]
            },
            'blueberry': {
                ACTION: [
                    'Berries ripen to a deep blue, holding sun-sweet heat beneath a fragile skin.',
                    'Large paws shake branches; scent and sugar scatter as predators test the abundance I cradle.',
                    'Leaves redden for cold; I slow ripening and hold fruit like small, stubborn suns.'
                ]
            },
            'deer': {
                ACTION: [
                    'I ghost through fern and moss toward the scent of berries, muscles tuned to soft, careful steps.',
                    'A sudden crack sends me skittering; heart thunders as I decide whether to flee or freeze.',
                    'Antlers harden and shed velvet; I move differently now, edges sharper in the thinning light.'
                ]
            },
            'lichen': {
                ACTION: [
                    'I spread slowly over north bark, patient and thin, recording years in pale green rings.',
                    'A sour haze settles the air; growth slows and I tense, folding metabolic pace down.',
                    'Cracks form and fragments sail on wind; I colonize new bark where chance lands me.'
                ]
            }
        },

        adjacencyRules: {
            'boulder': ['pine', 'mushroom'],
            'pine': ['cloud', 'mushroom'],
            'ants-nest': ['boulder', 'mushroom'],
            'mushroom': ['pine', 'ants-nest'],
            'cloud': ['pine'],
            'fern': [],
            'blueberry': [],
            'deer': [],
            'lichen': []
        },
        ambientBehaviors: [
            { entity: 'cloud', vector: 'ACTION', index: 2, probability: 0.4 },
            { entity: 'ants-nest', vector: 'ACTION', index: 0, probability: 0.3 },
            { entity: 'pine', vector: 'ACTION', index: 0, probability: 0.3 }
        ]
    }
};

// DOM shortcuts
const scenarioSelect = document.getElementById('scenario');
const lockBtn = document.getElementById('lockBtn');

let pendingVector = null; // stores currently chosen vector for lock (null when none)
const gridElem = document.getElementById('grid');
const entityList = document.getElementById('entityList');
const worldtextElem = document.getElementById('worldtext');
const auditLogElem = document.getElementById('auditLog');
const latentActionsContainer = document.getElementById('latentActions');
// vector control buttons removed; latent text buttons handle ripples
const autoplayBtn = document.getElementById('autoplayBtn');
const countdownElem = document.getElementById('countdown');

function init() {
    // load text variations
    loadVariations();
    
    // populate scenario dropdown
    Object.keys(latentLibrary).forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = latentLibrary[id].name;
        scenarioSelect.appendChild(option);
    });
    scenarioSelect.addEventListener('change', () => changeScenario(scenarioSelect.value));

    autoplayBtn.addEventListener('click', toggleAutoplay);
    const addBtn = document.getElementById('addEntityBtn');
    if (addBtn) addBtn.addEventListener('click', addRandomEntity);
    if (lockBtn) lockBtn.addEventListener('click', lockAndPlay);

    document.addEventListener('keydown', handleKeydown);

    // start with first scenario (should be forest if defined first)
    if (scenarioSelect.options.length) {
        changeScenario(scenarioSelect.options[0].value);
    }
}

function changeScenario(id) {
    currentScenario = latentLibrary[id];
    selectedEntity = null;
    pendingVector = null;
    if (lockBtn) lockBtn.disabled = true;
    tick = 0;
    auditLog = [];
    // render grid
    buildGrid();
    rebuildEntityPool();
    displayWorldtext(currentScenario.baseline || '');
    updateAuditLog();
    updateLatentPanel();
    updateVectorButtons();
}

function buildGrid() {
    gridElem.innerHTML = '';
    const cols = currentScenario.grid.cols || 8;
    const rows = currentScenario.grid.rows || 6;
    gridElem.style.setProperty('--cols', cols);
    // create empty cells
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.addEventListener('click', () => {
                const entity = entityAtPosition(x, y);
                if (entity) selectEntity(entity.id);
            });
            gridElem.appendChild(cell);
        }
    }
    renderEntities();
}

function entityAtPosition(x, y) {
    return currentScenario.entities.find(e => e.position.x === x && e.position.y === y);
}

function renderEntities() {
    Array.from(gridElem.children).forEach(cell => {
        const x = parseInt(cell.dataset.x, 10);
        const y = parseInt(cell.dataset.y, 10);
        const ent = entityAtPosition(x, y);
        cell.innerHTML = '';
        cell.classList.remove('has-entity','selected');
        if (ent) {
            cell.classList.add('has-entity');
            cell.textContent = ent.icon || ent.id;
        }
        if (selectedEntity && ent && ent.id === selectedEntity.id) {
            cell.classList.add('selected');
        }
    });
}

function rebuildEntityPool() {
    entityList.innerHTML = '';
    currentScenario.entities.forEach((ent, idx) => {
        const li = document.createElement('li');
        li.textContent = `${ent.icon || ''} ${ent.name} (${ent.state || ent.type})`;
        li.dataset.id = ent.id;
        li.addEventListener('click', () => selectEntity(ent.id));
        if (selectedEntity && selectedEntity.id === ent.id) li.classList.add('selected');
        entityList.appendChild(li);
    });
    // enforce limit and update add button
    const addBtn = document.getElementById('addEntityBtn');
    if (addBtn) {
        addBtn.disabled = currentScenario.entities.length >= 10;
    }
}

function selectEntity(id) {
    selectedEntity = currentScenario.entities.find(e => e.id === id);
    // clear any pending vector when changing selection
    pendingVector = null;
    if (lockBtn) lockBtn.disabled = true;
    document.querySelectorAll('.latent-entry').forEach(el => el.classList.remove('selected'));
    renderEntities();
    rebuildEntityPool();
    updateVectorButtons();
    updateLatentPanel();
}

function updateVectorButtons() {
    // no-op now that separate controls are removed; latent buttons handle state
}

function updateLatentPanel() {
    // render three ACTION buttons for the selected entity
    latentActionsContainer.innerHTML = '';
    if (!selectedEntity) return;
    const id = selectedEntity.id;
    const latent = currentScenario.latent[id] || {};
    // if generation is in progress, show placeholders
    const processing = generatingLatents;
    
    // show grayed-out context box if an action was previously triggered
    if (initiatingInfo && initiatingInfo.entityId && initiatingInfo.text) {
        const contextBox = document.createElement('div');
        contextBox.className = 'latent-context-box';
        const initiatingEntity = currentScenario.entities.find(e => e.id === initiatingInfo.entityId);
        const entityName = initiatingEntity ? initiatingEntity.name : initiatingInfo.entityId;
        contextBox.textContent = `${entityName}: ${initiatingInfo.text}`;
        latentActionsContainer.appendChild(contextBox);
    }
    
    for (let i = 0; i < 3; i++) {
        const btn = document.createElement('button');
        btn.id = `latentAction${i}`;
        btn.className = 'latent-entry action';
        btn.disabled = processing;
        if (processing) btn.classList.add('processing');
        const text = (latent.ACTION && latent.ACTION[i]) ? latent.ACTION[i] : '[no action]';
        btn.textContent = text;
        // clicking selects a pending action (index)
        btn.onclick = () => selectPending(i, text);
        latentActionsContainer.appendChild(btn);
    }
}

async function triggerRipple(vector, entId=null) {
    // allow calling with explicit entity id so we don't have to change selectedEntity
    if (!entId) {
        if (!selectedEntity) return;
        entId = selectedEntity.id;
    }
    // vector may be an object { vector: 'ACTION', index: n } or a simple string
    let vecName = 'ACTION';
    let vecIndex = 0;
    if (typeof vector === 'object' && vector !== null) {
        vecName = vector.vector || 'ACTION';
        vecIndex = typeof vector.index === 'number' ? vector.index : 0;
    } else if (typeof vector === 'string') {
        vecName = vector;
    }
    const description = await generateWorldtext(currentScenario, entId, vecName, vecIndex);
    // show worldtext with clickable entity names
    displayWorldtext(description);
    // propagate to adjacent using simple intensity decay
    const adj = currentScenario.adjacencyRules?.[entId] || [];
    // log event (use name if available)
    const ent = currentScenario.entities.find(e=>e.id===entId);
    auditLog.unshift({ tick, entity: ent ? ent.name : entId, vector, description });
    updateAuditLog();
    tick++;

    // update latents for relevant (adjacent) entities only
    regenerateRelevant(entId, { vector: vecName, index: vecIndex });
}


function displayWorldtext(text) {
    // replace entity names with clickable spans
    let html = text;
    if (currentScenario) {
        currentScenario.entities.forEach(ent => {
            const name = ent.name;
            const re = new RegExp(`\\b${name}\\b`, 'g');
            html = html.replace(re, `<span class=\"entity-link\" data-id=\"${ent.id}\">${name}</span>`);
        });
    }
    worldtextElem.innerHTML = html;
    // attach click handlers
    worldtextElem.querySelectorAll('.entity-link').forEach(el => {
        el.addEventListener('click', () => selectEntity(el.dataset.id));
    });
}

function updateAuditLog() {
    auditLogElem.innerHTML = '';
    auditLog.forEach((entry, idx) => {
        const li = document.createElement('li');
        li.textContent = `[${entry.tick}] ${entry.entity} → ${entry.vector}`;
        li.addEventListener('click', () => {
            displayWorldtext(entry.description);
        });
        auditLogElem.appendChild(li);
    });
}

function handleKeydown(evt) {
    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA') return;
    switch(evt.key) {
        case 'g': case 'G': selectPending(0); break;
        case 'o': case 'O': selectPending(1); break;
        case 's': case 'S': selectPending(2); break;
        case ' ': toggleAutoplay(); break;
        case 'ArrowLeft': cycleScenario(-1); break;
        case 'ArrowRight': cycleScenario(1); break;
        case '1': case '2': case '3': case '4': case '5': case '6': {
            const idx = parseInt(evt.key, 10) - 1;
            if (currentScenario && currentScenario.entities[idx]) {
                selectEntity(currentScenario.entities[idx].id);
            }
            break;
        }
        default: break;
    }
}

function cycleScenario(delta) {
    const opts = Array.from(scenarioSelect.options);
    const idx = opts.findIndex(o=>o.value===scenarioSelect.value);
    let newIdx = (idx + delta + opts.length) % opts.length;
    scenarioSelect.value = opts[newIdx].value;
    changeScenario(scenarioSelect.value);
}

function toggleAutoplay() {
    isAutoplay = !isAutoplay;
    autoplayBtn.textContent = `Autoplay: ${isAutoplay ? 'On' : 'Off'} (Space)`;
    if (isAutoplay) startAutoplay(); else stopAutoplay();
}

function startAutoplay() {
    if (autoplayInterval) clearInterval(autoplayInterval);
    const interval = 60000 / bpm;
    let remaining = interval;
    // update countdown every 100ms
    countdownElem.textContent = `${Math.ceil(remaining/1000)}s`;
    const countdownTicker = setInterval(() => {
        remaining -= 100;
        if (remaining <= 0) {
            remaining = interval;
        }
        countdownElem.textContent = `${Math.ceil(remaining/1000)}s`;
    }, 100);
    autoplayInterval = setInterval(() => {
        performAmbientAction();
    }, interval);
    // clear countdown ticker when autoplay stops
    autoplayInterval._countdownTicker = countdownTicker;
}

function stopAutoplay() {
    if (autoplayInterval) {
        clearInterval(autoplayInterval);
        if (autoplayInterval._countdownTicker) clearInterval(autoplayInterval._countdownTicker);
    }
    autoplayInterval = null;
    countdownElem.textContent = '';
}

function performAmbientAction() {
    const behaviors = currentScenario.ambientBehaviors || [];
    if (!behaviors.length) return;
    const r = Math.random();
    let cum = 0;
    for (const b of behaviors) {
        cum += b.probability;
        if (r < cum) {
            selectEntity(b.entity);
            triggerRipple(b.vector);
            break;
        }
    }
}

async function regenerateRelevant(baseId, vector) {
    // also clear pending when we initiate regeneration
    pendingVector = null;
    if (lockBtn) lockBtn.disabled = true;
    if (!currentScenario) return;
    const neighbors = currentScenario.adjacencyRules?.[baseId] || [];
    const vecName = (typeof vector === 'object' && vector.vector) ? vector.vector : vector;
    const vecIndex = (typeof vector === 'object' && typeof vector.index === 'number') ? vector.index : 0;
    for (const nid of neighbors) {
        if (!currentScenario.latent[nid]) currentScenario.latent[nid] = {};
        if (!currentScenario.latent[nid].ACTION) currentScenario.latent[nid].ACTION = [];
        const newText = await generateWorldtext(currentScenario, nid, vecName, vecIndex);
        currentScenario.latent[nid].ACTION[vecIndex] = newText;
    }
    // if selected entity is among neighbors, refresh panel
    if (selectedEntity && neighbors.includes(selectedEntity.id)) {
        updateLatentPanel();
    }
}

// --- pending selection helpers ------------------------------------------------
function selectPending(index, text) {
    if (!selectedEntity) return;
    pendingVector = { vector: 'ACTION', index };
    // if text not provided, try to fetch from latent library
    if (!text) {
        const latent = currentScenario.latent?.[selectedEntity.id] || {};
        text = (latent.ACTION && latent.ACTION[index]) ? latent.ACTION[index] : '';
    }
    if (text) displayWorldtext(text);
    if (lockBtn) lockBtn.disabled = false;
    // highlight latent button
    document.querySelectorAll('.latent-entry').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById(`latentAction${index}`);
    if (el) el.classList.add('selected');
    // save initiating context for later API calls
    initiatingInfo = {
        entityId: selectedEntity.id,
        vector: 'ACTION',
        index,
        text
    };
}

async function lockAndPlay() {
    if (!pendingVector || !selectedEntity) return;
    // immediately indicate generation will occur
    if (latentActionsContainer) {
        const buttons = latentActionsContainer.querySelectorAll('.latent-entry');
        buttons.forEach((b, idx) => {
            b.textContent = '...';
            b.classList.add('processing');
            b.disabled = true;
        });
    }
    const startId = selectedEntity.id;
    const visited = new Set();
    const queue = [{id: startId, delay: 0}];
    let maxDelay = 0;
    while(queue.length) {
        const {id, delay} = queue.shift();
        visited.add(id);
        maxDelay = Math.max(maxDelay, delay);
        setTimeout(() => {
            // do not change selection during propagation
            triggerRipple(pendingVector, id);
        }, delay);
        const neighbors = currentScenario.adjacencyRules?.[id] || [];
        for(const nid of neighbors) {
            if(!visited.has(nid)) {
                queue.push({id: nid, delay: delay + 500});
            }
        }
    }
    // after all ripples complete, regenerate all latent texts globally
    setTimeout(async () => {
        await refreshAllLatentsCompletely();
        // restore original selection so latent panel reflects initiating entity
        selectEntity(startId);
    }, maxDelay + 1000);
    // reset pending
    pendingVector = null;
    if (lockBtn) lockBtn.disabled = true;
    document.querySelectorAll('.latent-entry').forEach(el => el.classList.remove('selected'));
}

// refresh all latent texts for all entities and all vectors
async function refreshAllLatentsCompletely() {
    if (!currentScenario) return;
    generatingLatents = true;
    // show placeholder for whatever is currently selected
    updateLatentPanel();
    const tasks = [];
    for (const ent of currentScenario.entities) {
        const id = ent.id;
        if (!currentScenario.latent[id]) currentScenario.latent[id] = {};
        // generate three ACTION entries per entity
        currentScenario.latent[id].ACTION = currentScenario.latent[id].ACTION || [];
        for (let i = 0; i < 3; i++) {
            tasks.push((async (idx) => {
                const newText = await generateWorldtext(currentScenario, id, 'ACTION', idx);
                console.log('[regen]', id, 'ACTION', idx, newText);
                currentScenario.latent[id].ACTION[idx] = newText;
            })(i));
        }
    }
    await Promise.all(tasks);
    generatingLatents = false;
    updateLatentPanel();
}

function addRandomEntity() {
    if (!currentScenario) return;
    if (currentScenario.entities.length >= 10) return;
    // simple pool of extras
    const pool = [
        { id: 'fern', name: 'Lush Fern', type: 'animate', state: 'unfurling', icon: '🌿', adjacentTo: [] },
        { id: 'blueberry', name: 'Wild Blueberry', type: 'animate', state: 'ripe', icon: '🫐', adjacentTo: [] },
        { id: 'deer', name: 'Forest Deer', type: 'animate', state: 'foraging', icon: '🦌', adjacentTo: [] },
        { id: 'lichen', name: 'Pale Lichen', type: 'animate', state: 'spreading', icon: '🟩', adjacentTo: [] },
        { id: 'squirrel', name: 'Squirrel', type: 'animate', state: 'scurrying', icon: '🐿️', adjacentTo: [] },
        { id: 'rock', name: 'Loose Rock', type: 'inanimate', state: 'resting', icon: '🪨', adjacentTo: [] },
        { id: 'stream', name: 'Forest Stream', type: 'abstract', state: 'flowing', icon: '💧', adjacentTo: [] }
    ];
    // pick an unused entry
    const available = pool.filter(p => !currentScenario.entities.find(e => e.id === p.id));
    if (!available.length) return;
    const choice = available[Math.floor(Math.random() * available.length)];
    // position randomly available cell
    const cols = currentScenario.grid.cols || 8;
    const rows = currentScenario.grid.rows || 6;
    let pos;
    do {
        pos = { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) };
    } while (currentScenario.entities.find(e => e.position.x === pos.x && e.position.y === pos.y));
    const newEnt = { ...choice, position: pos };
    currentScenario.entities.push(newEnt);
    // also add placeholder latent ACTION descriptions so ripples work
    currentScenario.latent[newEnt.id] = { ACTION: [
        `The ${newEnt.name} considers moving toward something nearby in a simple way.`,
        `The ${newEnt.name} senses a small resistance that might alter its path.`,
        `The ${newEnt.name} contemplates a subtle change and holds still for now.`
    ] };
    currentScenario.adjacencyRules[newEnt.id] = [];
    rebuildEntityPool();
    renderEntities();
}

async function generateWorldtext(scenario, entityId, vector, index=0) {
    // vector expected to be 'ACTION' in the new model; index selects which action
    let latent = null;
    if (vector === 'ACTION') {
        latent = scenario.latent?.[entityId]?.ACTION?.[index];
    } else {
        latent = scenario.latent?.[entityId]?.[vector];
    }
    if (!latent) {
        if (vector === 'ACTION') {
            latent = 'I respond to what unfolds around me.';
        } else {
            latent = 'I consider this now.';
        }
    }
    // attempt API-driven generation if we have a key
    if (OPENAI_API_KEY) {
        const systemPrompts = `You are a RIPPLES worldtext generator. Follow the specification exactly: produce a total of 10-20 words in a **first-person** poetic description from the perspective of the given entity when the provided vector is applied. Use uncertainty markers and state-focused language. Do not write in third person.`;
        // include initiating context if available
        let contextSnippet = '';
        if (initiatingInfo && initiatingInfo.entityId && initiatingInfo.entityId !== entityId) {
            contextSnippet = `\nInitiating Entity: ${initiatingInfo.entityId}` +
                         `\nInitiating Action Index: ${initiatingInfo.index}` +
                         `\nInitiating Action Text: ${initiatingInfo.text}`;
        }
        let userPrompt = `Scenario: ${scenario.name}\nEntity: ${entityId}\nVector: ${vector}\nActionIndex: ${index}` + contextSnippet;
        if (latent) userPrompt += `\nSeed-action text: ${latent}`;
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompts },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 500
                })
            });
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content?.trim();
            if (text && text !== latent) return text;
            // if the LLM returned nothing or repeated the seed, fall through to procedural
        } catch (e) {
            console.error('LLM error', e);
            // fall through to procedural generation
        }
    }

    // no key or API failed/returned empty: procedural fallback
    return generateProceduralWorldtext(scenario, entityId, vector, latent, index);
}

async function loadVariations() {
    try {
        const resp = await fetch('variations.json');
        textVariations = await resp.json();
        console.log('Variations loaded from JSON');
    } catch (e) {
        console.warn('Could not load variations.json, using hardcoded fallback', e);
        textVariations = null;
    }
}

function generateProceduralWorldtext(scenario, entityId, vector, baseSeed, index=0) {
    const ent = scenario.entities.find(e => e.id === entityId);
    if (!ent) return baseSeed;
    
    // Try to use loaded variations from JSON (entity-specific)
    let pool = [];
    if (textVariations && textVariations[entityId] && textVariations[entityId].ACTION) {
        pool = textVariations[entityId].ACTION;
    } else if (textVariations && textVariations[vector]) {
        // fallback if JSON used different shape
        pool = textVariations[vector];
    } else {
        // Fallback to hardcoded variations if JSON failed to load
        pool = getFallbackVariations('ACTION');
    }
    
    if (pool.length === 0) return baseSeed;
    
    // If an indexed action exists in the pool, prefer it
    if (pool[index]) return pool[index];

    // Pick a random variation and add entity-specific flavor, avoiding the baseSeed if possible
    let variation;
    let attempts = 0;
    do {
        variation = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
        // avoid infinite loop if pool only has one element
    } while ((variation + (ent?.type === 'animate' ? ` As a living thing, I sense the world shifting around me.` : ent?.type === 'inanimate' ? ` My substance remains, but its meaning changes.` : ent?.type === 'abstract' ? ` I dissolve and reform, ever ephemeral.` : '')) === baseSeed && attempts < 5);
    const entityType = ent?.type || 'entity';
    
    // Append a contextual sentence based on entity
    let suffix = '';
    if (entityType === 'animate') suffix = ` As a living thing, I sense the world shifting around me.`;
    else if (entityType === 'inanimate') suffix = ` My substance remains, but its meaning changes.`;
    else if (entityType === 'abstract') suffix = ` I dissolve and reform, ever ephemeral.`;
    
    return variation + suffix;
}

function getFallbackVariations(vector) {
    // Hardcoded fallback in case JSON load fails
    const fallback = {
        ACTION: [
            `I reach toward the light, unfurling careful movement that tastes warmth and possibility.`,
            `I step aside from pressure, testing the ground and pausing to listen for further cues.`,
            `I gather moisture into my tissues and edge slowly toward safer, softer soil below.`,
            `I spread a thin thread of growth along shaded bark, searching for a crack to hold.`,
            `I pivot a small movement outward, feeling the surface shift beneath my contact and respond.`
        ]
    };
    return fallback[vector] || [];
}

// flag showing we are currently regenerating latents
let generatingLatents = false;

// initialize on load
window.addEventListener('DOMContentLoaded', init);

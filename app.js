// Core state
let currentScenario = null;
let selectedEntity = null;
let tick = 0;
let isAutoplay = false;
let auditLog = [];
let bpm = 3;
let autoplayInterval = null;
const MAX_ENTITIES = 13;

// Ecological Trigger System:
// ===========================
// When users execute actions, the LLM-generated worldtext is automatically checked for
// special markers that cause dynamic ecosystem changes. These triggers are embedded in
// the natural language output and then stripped from display.
//
// Available Triggers:
// - [EATS:entityId] - actor consumes the target entity (removes it from grid)
// - [DIES] - actor dies and is removed from the grid
// - [FLEES] - actor leaves the scene (removed from grid)
// - [WITHERS] - actor gradually disappears (removed from grid)
// - [SPAWNS:entityId] - creates a new entity near the actor
//
// Execution Flow:
// 1. User selects entity and action → triggerRipple() executes
// 2. LLM generates worldtext (Ollama → OpenAI → procedural fallback)
// 3. parseEcologicalTriggers() scans the generated text for markers
// 4. If found, executeEcologicalActions() runs them with 1s delays between each
// 5. displayWorldtext() strips markers and shows clean prose to user
// 6. Grid updates dynamically as entities appear/disappear
//
// Note: Triggers only fire when actions are EXECUTED by the user, not when latent
// actions are regenerated in the background. This prevents unwanted cascade effects.
//
// The LLMs are prompted to include these markers sparingly (10-20% of actions) to
// create ecological drama: predators eating prey, plants spawning offspring, weak
// entities dying or fleeing from threats.

// Load variations from JSON file
let textVariations = null;

// information about the latent the user selected (seed for generation)
let initiatingInfo = { entityId: null, vector: null, text: '' };

// API key now handled server-side via Vercel environment variables

// Latent library with a forest scenario
const latentLibrary = {
    forest: {
        name: 'DEEP FOREST',
        baseline: 'Moss blankets the ground. Light filters through a canopy of needles.',
        grid: { cols: 6, rows: 4, background: 'forest-green' },
        entities: [
            { id: 'owl', name: 'Night Owl', type: 'animate', state: 'hunting', position: { x: 0, y: 0 }, icon: '🦉', adjacentTo: [] },
            { id: 'sun', name: 'Midday Sun', type: 'abstract', state: 'radiant', position: { x: 4, y: 0 }, icon: '☀️', adjacentTo: ['blueberry'] },
            { id: 'pine', name: 'Towering Pine', type: 'animate', state: 'ancient', position: { x: 0, y: 1 }, icon: '🌲', adjacentTo: ['ant'] },
            { id: 'ant', name: 'Scout Ant', type: 'animate', state: 'searching', position: { x: 1, y: 1 }, icon: '🐜', adjacentTo: ['pine', 'boulder', 'earth'] },
            { id: 'boulder', name: 'Ancient Boulder', type: 'inanimate', state: 'immobile', position: { x: 2, y: 1 }, icon: '🪨', adjacentTo: ['ant', 'stream'] },
            { id: 'blueberry', name: 'Wild Blueberry', type: 'animate', state: 'ripe', position: { x: 4, y: 1 }, icon: '🫐', adjacentTo: ['sun'] },
            { id: 'earth', name: 'Dark Earth', type: 'inanimate', state: 'nourishing', position: { x: 1, y: 2 }, icon: '🟫', adjacentTo: ['ant'] },
            { id: 'deer', name: 'Forest Deer', type: 'animate', state: 'foraging', position: { x: 3, y: 2 }, icon: '🦌', adjacentTo: [] },
            { id: 'beetle', name: 'Ground Beetle', type: 'animate', state: 'crawling', position: { x: 5, y: 2 }, icon: '🪲', adjacentTo: [] },
            { id: 'stream', name: 'Forest Stream', type: 'abstract', state: 'flowing', position: { x: 2, y: 3 }, icon: '💧', adjacentTo: ['boulder'] }
        ],
        latent: {
            'owl': {
                ACTION: [
                    'I scan the ground for movement.',
                    'I dive toward the beetle on the bark.'
                ]
            },
            'sun': {
                ACTION: [
                    'I pour heat onto the forest floor.',
                    'I shift behind a cloud.'
                ]
            },
            'ant': {
                ACTION: [
                    'I lay a scent trail toward food.',
                    'I reroute the column around an obstacle.'
                ]
            },
            'boulder': {
                ACTION: [
                    'I settle deeper into the earth.',
                    'I resist the stream\'s pressure.'
                ]
            },
            'blueberry': {
                ACTION: [
                    'I ripen my berries.',
                    'I drop seeds onto the soil.'
                ]
            },
            'earth': {
                ACTION: [
                    'I absorb rainwater.',
                    'I release nutrients to roots.'
                ]
            },
            'deer': {
                ACTION: [
                    'I move toward the berry bush.',
                    'I freeze at a sudden sound.'
                ]
            },
            'stream': {
                ACTION: [
                    'I carve into the stone.',
                    'I carry a leaf downstream.'
                ]
            },
            'pine': {
                ACTION: [
                    'I drop needles onto the forest floor.',
                    'I spread my branches wider.'
                ]
            },
            'beetle': {
                ACTION: [
                    'I crawl beneath fallen leaves.',
                    'I burrow into soft moss.'
                ]
            }
        },

        adjacencyRules: {
            'owl': [],
            'sun': ['blueberry'],
            'pine': ['ant'],
            'ant': ['pine', 'boulder', 'earth'],
            'boulder': ['ant', 'stream'],
            'blueberry': ['sun'],
            'earth': ['ant'],
            'deer': [],
            'beetle': [],
            'stream': ['boulder']
        },
        ambientBehaviors: [
            { entity: 'owl', vector: 'ACTION', index: 1, probability: 0.4 },
            { entity: 'stream', vector: 'ACTION', index: 0, probability: 0.3 },
            { entity: 'sun', vector: 'ACTION', index: 0, probability: 0.3 }
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
    updateCastDisplay();
}

function updateCastDisplay() {
    const castElem = document.getElementById('castEmojis');
    if (!castElem || !currentScenario) return;
    
    castElem.innerHTML = '';
    currentScenario.entities.forEach(ent => {
        const span = document.createElement('span');
        span.textContent = ent.icon || '⚫';
        span.title = ent.name;
        castElem.appendChild(span);
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
        addBtn.disabled = currentScenario.entities.length >= MAX_ENTITIES;
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
    // render two ACTION buttons for the selected entity
    latentActionsContainer.innerHTML = '';
    const processing = generatingLatents;
    const optionsRow = document.createElement('div');
    optionsRow.className = 'latent-options-row';
    latentActionsContainer.appendChild(optionsRow);

    if (!selectedEntity) {
        for (let i = 0; i < 2; i++) {
            const btn = document.createElement('button');
            btn.id = `latentAction${i}`;
            btn.className = 'latent-entry action';
            btn.textContent = 'pick an entity, choose an action';
            btn.disabled = true;
            optionsRow.appendChild(btn);
        }
        return;
    }

    const id = selectedEntity.id;
    const latent = currentScenario.latent[id] || {};
    
    // show grayed-out context box if an action was previously triggered
    if (initiatingInfo && initiatingInfo.entityId && initiatingInfo.text) {
        const contextBox = document.createElement('div');
        contextBox.className = 'latent-context-box';
        const initiatingEntity = currentScenario.entities.find(e => e.id === initiatingInfo.entityId);
        const entityName = initiatingEntity ? initiatingEntity.name : initiatingInfo.entityId;
        contextBox.textContent = `${entityName}: ${initiatingInfo.text}`;
        latentActionsContainer.insertBefore(contextBox, optionsRow);
    }
    
    for (let i = 0; i < 2; i++) {
        const btn = document.createElement('button');
        btn.id = `latentAction${i}`;
        btn.className = 'latent-entry action';
        btn.disabled = processing;
        if (processing) btn.classList.add('processing');
        const text = (latent.ACTION && latent.ACTION[i]) ? latent.ACTION[i] : '[no action]';
        btn.textContent = text;
        // clicking selects a pending action (index)
        btn.onclick = () => selectPending(i, text);
        optionsRow.appendChild(btn);
    }
}

async function triggerRipple(vector, entId=null, preselectedText=null) {
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
    
    // Use preselected text if provided (from user's actual selection)
    // Otherwise generate new text for propagated entities
    let description;
    if (preselectedText) {
        description = preselectedText;
        console.log('[triggerRipple] Using preselected text:', description);
        console.log('[triggerRipple] Text length:', description.length);
        console.log('[triggerRipple] Contains [SPAWNS]?:', description.includes('[SPAWNS'));
        console.log('[triggerRipple] Contains [spawns]?:', description.toLowerCase().includes('[spawns'));
    } else {
        description = await generateWorldtext(currentScenario, entId, vecName, vecIndex);
        console.log('[triggerRipple] Generated new text:', description);
    }
    
    // Check for ecological triggers in the text
    const triggers = parseEcologicalTriggers(description, entId);
    if (triggers.length > 0) {
        console.log('[Ecology] Found triggers:', triggers);
        executeEcologicalActions(triggers);
    } else {
        console.log('[Ecology] No triggers found in text');
    }
    
    // Auto-spawn entities mentioned in text that don't exist yet
    autoSpawnMentionedEntities(description, entId);
    
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
    // Strip out ecological trigger markers before displaying
    // Use flexible patterns to match various formatting (spaces, hyphens, case)
    let cleanedText = text
        .replace(/\[EATS?:\s*[\w-]+\s*\]/gi, '')  // Matches [EAT:x] or [EATS:x] with optional spaces
        .replace(/\[DIES?\]/gi, '')  // Matches [DIE] or [DIES]
        .replace(/\[FLEES?\]/gi, '')  // Matches [FLEE] or [FLEES]
        .replace(/\[WITHERS?\]/gi, '')  // Matches [WITHER] or [WITHERS]
        .replace(/\[SPAWNS?:\s*[\w-]+\s*\]/gi, '')  // Matches [SPAWN:x] or [SPAWNS:x] with optional spaces
        .trim();
    
    // replace entity names with clickable spans
    let html = cleanedText;
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
            // Select the entity
            selectEntity(b.entity);
            // Select the action
            selectPending(b.index);
            // Execute the action after a short delay
            setTimeout(() => {
                lockAndPlay();
            }, 500);
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
        // Note: We don't execute ecological triggers here - only when user
        // actually selects and executes an action via triggerRipple()
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
    const selectedText = initiatingInfo?.text || null;
    const visited = new Set();
    const queue = [{id: startId, delay: 0, isStart: true}];
    let maxDelay = 0;
    while(queue.length) {
        const {id, delay, isStart} = queue.shift();
        visited.add(id);
        maxDelay = Math.max(maxDelay, delay);
        setTimeout(() => {
            // For the starting entity, use the actual selected text
            // For propagated entities, generate new text
            const textToUse = (isStart && selectedText) ? selectedText : null;
            triggerRipple(pendingVector, id, textToUse);
        }, delay);
        const neighbors = currentScenario.adjacencyRules?.[id] || [];
        for(const nid of neighbors) {
            if(!visited.has(nid)) {
                queue.push({id: nid, delay: delay + 500, isStart: false});
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
        // generate two ACTION entries per entity
        currentScenario.latent[id].ACTION = currentScenario.latent[id].ACTION || [];
        for (let i = 0; i < 2; i++) {
            tasks.push((async (idx) => {
                const newText = await generateWorldtext(currentScenario, id, 'ACTION', idx);
                console.log('[regen]', id, 'ACTION', idx, newText);
                // Note: We don't execute ecological triggers here - only when user
                // actually selects and executes an action via triggerRipple()
                // Safety check: entity might have been removed during async generation
                if (currentScenario.latent[id] && currentScenario.latent[id].ACTION) {
                    currentScenario.latent[id].ACTION[idx] = newText;
                }
            })(i));
        }
    }
    await Promise.all(tasks);
    generatingLatents = false;
    updateLatentPanel();
}

function addRandomEntity() {
    if (!currentScenario) return;
    if (currentScenario.entities.length >= MAX_ENTITIES) return;
    // simple pool of extras
    const pool = [
        { id: 'fern', name: 'Lush Fern', type: 'animate', state: 'unfurling', icon: '🌿', adjacentTo: [] },
        { id: 'blueberry', name: 'Wild Blueberry', type: 'animate', state: 'ripe', icon: '🫐', adjacentTo: [] },
        { id: 'deer', name: 'Forest Deer', type: 'animate', state: 'foraging', icon: '🦌', adjacentTo: [] },
        { id: 'lichen', name: 'Pale Lichen', type: 'animate', state: 'spreading', icon: '🟩', adjacentTo: [] },
        { id: 'squirrel', name: 'Red Squirrel', type: 'animate', state: 'foraging', icon: '🐿️', adjacentTo: [] },
        { id: 'stream', name: 'Forest Stream', type: 'abstract', state: 'flowing', icon: '💧', adjacentTo: [] },
        { id: 'moss', name: 'Soft Moss', type: 'animate', state: 'spreading', icon: '🌱', adjacentTo: [] },
        { id: 'spider', name: 'Web Spider', type: 'animate', state: 'weaving', icon: '🕷️', adjacentTo: [] },
        { id: 'owl', name: 'Night Owl', type: 'animate', state: 'hunting', icon: '🦉', adjacentTo: [] },
        { id: 'moth', name: 'Luna Moth', type: 'animate', state: 'fluttering', icon: '🦋', adjacentTo: [] },
        { id: 'rock', name: 'Loose Rock', type: 'inanimate', state: 'resting', icon: '🪨', adjacentTo: [] },
        { id: 'fox', name: 'Red Fox', type: 'animate', state: 'prowling', icon: '🦊', adjacentTo: [] },
        { id: 'salamander', name: 'Salamander', type: 'animate', state: 'hiding', icon: '🦎', adjacentTo: [] },
        { id: 'shadow', name: 'Forest Shadow', type: 'abstract', state: 'shifting', icon: '🌑', adjacentTo: [] },
        { id: 'earth', name: 'Dark Earth', type: 'inanimate', state: 'nourishing', icon: '🟫', adjacentTo: [] },
        { id: 'sapling', name: 'Young Sapling', type: 'animate', state: 'reaching', icon: '🌱', adjacentTo: [] },
        { id: 'oak', name: 'Ancient Oak', type: 'animate', state: 'towering', icon: '🌳', adjacentTo: [] },
        { id: 'flower', name: 'Wildflower', type: 'animate', state: 'blooming', icon: '🌸', adjacentTo: [] }
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

function removeEntity(entityId) {
    if (!currentScenario) {
        console.error(`[removeEntity] No current scenario`);
        return;
    }
    
    // Normalize entity ID for case-insensitive lookup
    const normalizedId = entityId.toLowerCase();
    const idx = currentScenario.entities.findIndex(e => e.id.toLowerCase() === normalizedId);
    
    if (idx === -1) {
        console.warn(`[removeEntity] Entity '${entityId}' not found - may have already been removed or ID mismatch`);
        console.warn(`[removeEntity] Current entities:`, currentScenario.entities.map(e => e.id).join(', '));
        return;
    }
    
    const entity = currentScenario.entities[idx];
    const actualId = entity.id; // Use the actual ID from the found entity
    console.log(`[removeEntity] Removing entity: ${actualId} (${entity.name})`);
    
    // Remove from entities array
    currentScenario.entities.splice(idx, 1);
    
    // Clean up adjacency rules (use actual ID)
    delete currentScenario.adjacencyRules[actualId];
    // Remove references in other entities' adjacency lists
    Object.keys(currentScenario.adjacencyRules).forEach(key => {
        currentScenario.adjacencyRules[key] = currentScenario.adjacencyRules[key].filter(id => id.toLowerCase() !== normalizedId);
    });
    
    // Clean up latent data (use actual ID)
    delete currentScenario.latent[actualId];
    
    // If this was the selected entity, deselect
    if (selectedEntity && selectedEntity.id.toLowerCase() === normalizedId) {
        selectedEntity = null;
        updateLatentPanel();
    }
    
    rebuildEntityPool();
    renderEntities();
    
    console.log(`[removeEntity] Successfully removed ${actualId}. Remaining entities:`, currentScenario.entities.map(e => e.id).join(', '));
}

function autoSpawnMentionedEntities(text, actorEntityId) {
    if (!currentScenario || !text) return;
    
    // List of all possible entity IDs (from spawn pool + emoji map)
    const knownEntityIds = [
        'fox', 'wolf', 'bear', 'rabbit', 'squirrel', 'deer',
        'bird', 'crow', 'hawk', 'owl', 'snake',
        'frog', 'toad', 'lizard', 'salamander',
        'beetle', 'ant', 'spider', 'moth', 'butterfly',
        'bee', 'wasp', 'fly', 'mosquito',
        'mouse', 'rat', 'bat', 'raccoon',
        'tree', 'pine', 'oak', 'willow', 'birch',
        'flower', 'rose', 'daisy', 'tulip', 'sunflower',
        'grass', 'fern', 'moss', 'lichen', 'algae',
        'mushroom', 'fungus', 'toadstool',
        'vine', 'ivy', 'bramble', 'bush', 'shrub',
        'sapling', 'sprout', 'seedling',
        'berry', 'blueberry', 'raspberry', 'blackberry',
        'sun', 'moon', 'star', 'cloud',
        'rain', 'snow', 'frost', 'ice',
        'wind', 'mist', 'fog',
        'stream', 'river', 'pond', 'pool',
        'rock', 'stone', 'boulder', 'pebble',
        'earth', 'soil', 'dirt', 'mud',
        'shadow', 'darkness', 'light',
        'fire', 'ember', 'spark',
        'log', 'branch', 'twig',
        'leaf', 'needle'
    ];
    
    // Normalize text to lowercase for matching
    const lowerText = text.toLowerCase();
    
    // Get current entity IDs (normalized)
    const currentEntityIds = currentScenario.entities.map(e => e.id.toLowerCase());
    
    // Find mentioned entities that don't exist yet
    const entitiesToSpawn = [];
    for (const entityId of knownEntityIds) {
        // Skip if entity already exists
        if (currentEntityIds.includes(entityId)) continue;
        
        // Skip if it's the base ID of an existing numbered variant (e.g., skip 'blueberry' if 'blueberry-2' exists)
        if (currentEntityIds.some(id => id.startsWith(entityId + '-'))) continue;
        
        // Check if entity name appears in text as a word boundary
        const regex = new RegExp(`\\b${entityId}\\b`, 'i');
        if (regex.test(lowerText)) {
            console.log(`[AutoSpawn] Found mention of '${entityId}' in text`);
            entitiesToSpawn.push(entityId);
        }
    }
    
    // Spawn each mentioned entity
    for (const entityId of entitiesToSpawn) {
        console.log(`[AutoSpawn] Spawning ${entityId} near ${actorEntityId}`);
        spawnEntity(entityId, actorEntityId);
    }
    
    if (entitiesToSpawn.length > 0) {
        rebuildEntityPool();
        renderEntities();
    }
}

function createDynamicEntity(entityId) {
    // Generate entity metadata based on ID
    // This allows LLMs to spawn entities not in the predefined pool
    
    // Infer type from common patterns
    let type = 'animate';
    let state = 'present';
    
    // Abstract entities (weather, light, concepts)
    if (['cloud', 'shadow', 'mist', 'fog', 'wind', 'rain', 'snow', 'light', 'darkness', 'moon', 'star'].includes(entityId)) {
        type = 'abstract';
        state = 'shifting';
    }
    // Inanimate entities (objects, terrain)
    else if (['rock', 'stone', 'boulder', 'log', 'branch', 'soil', 'dust', 'water', 'ice'].includes(entityId)) {
        type = 'inanimate';
        state = 'resting';
    }
    // Living things default to animate
    else {
        type = 'animate';
        state = 'active';
    }
    
    // Generate appropriate emoji based on entity name
    const emojiMap = {
        // Animals
        'fox': '🦊', 'wolf': '🐺', 'bear': '🐻', 'rabbit': '🐇', 'squirrel': '🐿️',
        'bird': '🐦', 'crow': '🐦‍⬛', 'hawk': '🦅', 'owl': '🦉', 'snake': '🐍',
        'frog': '🐸', 'toad': '🐸', 'lizard': '🦎', 'salamander': '🦎',
        'beetle': '🪲', 'ant': '🐜', 'spider': '🕷️', 'moth': '🦋', 'butterfly': '🦋',
        'bee': '🐝', 'wasp': '🐝', 'fly': '🪰', 'mosquito': '🦟',
        'mouse': '🐁', 'rat': '🐀', 'bat': '🦇', 'raccoon': '🦝',
        // Plants
        'tree': '🌳', 'pine': '🌲', 'oak': '🌳', 'willow': '🌳', 'birch': '🌳',
        'flower': '🌸', 'rose': '🌹', 'daisy': '🌼', 'tulip': '🌷', 'sunflower': '🌻',
        'grass': '🌾', 'fern': '🌿', 'moss': '🌱', 'lichen': '🟩', 'algae': '🟢',
        'mushroom': '🍄', 'fungus': '🍄', 'toadstool': '🍄',
        'vine': '🌿', 'ivy': '🌿', 'bramble': '🌿', 'bush': '🌳', 'shrub': '🌳',
        'sapling': '🌱', 'sprout': '🌱', 'seedling': '🌱',
        'berry': '🫐', 'blueberry': '🫐', 'raspberry': '🍓', 'blackberry': '🫐',
        // Elements & Environment
        'sun': '☀️', 'moon': '🌙', 'star': '⭐', 'cloud': '☁️',
        'rain': '🌧️', 'snow': '❄️', 'frost': '❄️', 'ice': '🧊',
        'wind': '💨', 'mist': '🌫️', 'fog': '🌫️',
        'stream': '💧', 'river': '🌊', 'pond': '💧', 'pool': '💧',
        'rock': '🪨', 'stone': '🪨', 'boulder': '🪨', 'pebble': '🪨',
        'earth': '🟫', 'soil': '🟫', 'dirt': '🟫', 'mud': '🟤',
        'shadow': '🌑', 'darkness': '🌑', 'light': '✨',
        'fire': '🔥', 'ember': '🔥', 'spark': '✨',
        'log': '🪵', 'branch': '🪵', 'twig': '🪵',
        'leaf': '🍃', 'needle': '🌿'
    };
    
    const icon = emojiMap[entityId.toLowerCase()] || '⚫'; // Default to circle
    
    // Create readable name (capitalize and handle hyphens)
    const name = entityId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    
    return {
        id: entityId,
        name: name,
        type: type,
        state: state,
        icon: icon,
        adjacentTo: []
    };
}

function spawnEntity(entityId, nearEntityId=null) {
    if (!currentScenario) {
        console.error('[spawnEntity] No current scenario');
        return;
    }
    
    if (currentScenario.entities.length >= MAX_ENTITIES) {
        console.warn(`[spawnEntity] Cannot spawn ${entityId} - grid full (${currentScenario.entities.length}/${MAX_ENTITIES})`);
        return;
    }
    
    // Normalize entity ID to lowercase for matching
    const normalizedId = entityId.toLowerCase();
    
    // Allow spawning duplicate entities (e.g., blueberry can spawn another blueberry)
    // Just check if we have room on the grid
    
    console.log(`[spawnEntity] Attempting to spawn: ${entityId}`);
    
    // Find entity definition in pool
    const pool = [
        { id: 'fern', name: 'Lush Fern', type: 'animate', state: 'unfurling', icon: '🌿', adjacentTo: [] },
        { id: 'blueberry', name: 'Wild Blueberry', type: 'animate', state: 'ripe', icon: '🫐', adjacentTo: [] },
        { id: 'berry', name: 'Wild Berry', type: 'animate', state: 'ripe', icon: '🫐', adjacentTo: [] },
        { id: 'deer', name: 'Forest Deer', type: 'animate', state: 'foraging', icon: '🦌', adjacentTo: [] },
        { id: 'lichen', name: 'Pale Lichen', type: 'animate', state: 'spreading', icon: '🟩', adjacentTo: [] },
        { id: 'pine', name: 'Towering Pine', type: 'animate', state: 'ancient', icon: '🌲', adjacentTo: [] },
        { id: 'squirrel', name: 'Red Squirrel', type: 'animate', state: 'foraging', icon: '🐿️', adjacentTo: [] },
        { id: 'stream', name: 'Forest Stream', type: 'abstract', state: 'flowing', icon: '💧', adjacentTo: [] },
        { id: 'moss', name: 'Soft Moss', type: 'animate', state: 'spreading', icon: '🌱', adjacentTo: [] },
        { id: 'spider', name: 'Web Spider', type: 'animate', state: 'weaving', icon: '🕷️', adjacentTo: [] },
        { id: 'owl', name: 'Night Owl', type: 'animate', state: 'hunting', icon: '🦉', adjacentTo: [] },
        { id: 'moth', name: 'Luna Moth', type: 'animate', state: 'fluttering', icon: '🦋', adjacentTo: [] },
        { id: 'mushroom', name: 'Forest Mushroom', type: 'animate', state: 'fruiting', icon: '🍄', adjacentTo: [] },
        { id: 'fungus', name: 'Wild Fungus', type: 'animate', state: 'growing', icon: '🍄', adjacentTo: [] },
        { id: 'rock', name: 'Loose Rock', type: 'inanimate', state: 'resting', icon: '🪨', adjacentTo: [] },
        { id: 'fox', name: 'Red Fox', type: 'animate', state: 'prowling', icon: '🦊', adjacentTo: [] },
        { id: 'salamander', name: 'Salamander', type: 'animate', state: 'hiding', icon: '🦎', adjacentTo: [] },
        { id: 'shadow', name: 'Forest Shadow', type: 'abstract', state: 'shifting', icon: '🌑', adjacentTo: [] },
        { id: 'earth', name: 'Dark Earth', type: 'inanimate', state: 'nourishing', icon: '🟫', adjacentTo: [] },
        { id: 'sapling', name: 'Young Sapling', type: 'animate', state: 'reaching', icon: '🌱', adjacentTo: [] },
        { id: 'oak', name: 'Ancient Oak', type: 'animate', state: 'towering', icon: '🌳', adjacentTo: [] },
        { id: 'flower', name: 'Wildflower', type: 'animate', state: 'blooming', icon: '🌸', adjacentTo: [] },
        { id: 'bird', name: 'Forest Bird', type: 'animate', state: 'singing', icon: '🐦', adjacentTo: [] },
        { id: 'rabbit', name: 'Wild Rabbit', type: 'animate', state: 'hopping', icon: '🐇', adjacentTo: [] },
        { id: 'snake', name: 'Garden Snake', type: 'animate', state: 'slithering', icon: '🐍', adjacentTo: [] },
        { id: 'cloud', name: 'Drifting Cloud', type: 'abstract', state: 'floating', icon: '☁️', adjacentTo: [] },
        { id: 'beetle', name: 'Ground Beetle', type: 'animate', state: 'crawling', icon: '🪲', adjacentTo: [] },
        { id: 'ant', name: 'Forest Ant', type: 'animate', state: 'foraging', icon: '🐜', adjacentTo: [] }
    ];
    
    // Look up entity definition (case-insensitive)
    let entityDef = pool.find(p => p.id.toLowerCase() === normalizedId);
    
    // If entity not in predefined pool, create a dynamic entity definition
    if (!entityDef) {
        console.log(`[spawnEntity] Entity ${entityId} not in pool - creating dynamic entity`);
        entityDef = createDynamicEntity(normalizedId);
    } else {
        console.log(`[spawnEntity] Found ${entityId} in pool: ${entityDef.name}`);
    }
    
    // Position near the specified entity if provided, otherwise random
    const cols = currentScenario.grid.cols || 8;
    const rows = currentScenario.grid.rows || 6;
    let pos;
    
    if (nearEntityId) {
        const nearEntity = currentScenario.entities.find(e => e.id === nearEntityId);
        if (nearEntity) {
            // Try to find adjacent empty cell
            const adjacentPositions = [
                { x: nearEntity.position.x - 1, y: nearEntity.position.y },
                { x: nearEntity.position.x + 1, y: nearEntity.position.y },
                { x: nearEntity.position.x, y: nearEntity.position.y - 1 },
                { x: nearEntity.position.x, y: nearEntity.position.y + 1 }
            ].filter(p => p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows);
            
            const emptyAdjacent = adjacentPositions.filter(p => 
                !currentScenario.entities.find(e => e.position.x === p.x && e.position.y === p.y)
            );
            
            if (emptyAdjacent.length > 0) {
                pos = emptyAdjacent[Math.floor(Math.random() * emptyAdjacent.length)];
            }
        }
    }
    
    // Fallback to random position
    if (!pos) {
        let attempts = 0;
        do {
            pos = { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) };
            attempts++;
        } while (currentScenario.entities.find(e => e.position.x === pos.x && e.position.y === pos.y) && attempts < 100);
        
        if (attempts >= 100) {
            console.error('[spawnEntity] Could not find empty position after 100 attempts');
            return;
        }
    }
    
    // Create unique ID if an entity with this ID already exists
    let uniqueId = entityDef.id;
    if (currentScenario.entities.find(e => e.id === uniqueId)) {
        // Find next available number suffix
        let counter = 2;
        while (currentScenario.entities.find(e => e.id === `${entityDef.id}-${counter}`)) {
            counter++;
        }
        uniqueId = `${entityDef.id}-${counter}`;
        console.log(`[spawnEntity] Entity ${entityDef.id} already exists, using unique ID: ${uniqueId}`);
    }
    
    const newEnt = { ...entityDef, id: uniqueId, position: pos };
    currentScenario.entities.push(newEnt);
    
    console.log(`[spawnEntity] Successfully spawned ${uniqueId} (${entityDef.name}) at position (${pos.x}, ${pos.y})`);
    
    // Add placeholder latent ACTION descriptions
    currentScenario.latent[newEnt.id] = { ACTION: [
        `The ${newEnt.name} considers moving toward something nearby in a simple way.`,
        `The ${newEnt.name} senses a small resistance that might alter its path.`,
        `The ${newEnt.name} contemplates a subtle change and holds still for now.`
    ] };
    currentScenario.adjacencyRules[newEnt.id] = [];
    
    rebuildEntityPool();
    renderEntities();
    
    console.log(`[spawnEntity] Total entities now: ${currentScenario.entities.length}/${MAX_ENTITIES}`);
}

function parseEcologicalTriggers(text, actorId) {
    // Parse text for ecological interaction markers
    // Returns array of trigger objects
    const triggers = [];
    
    console.log('[Parser] Scanning text:', text);
    
    // [EATS:entityId] - actor consumes target
    // Allow optional spaces and hyphens in entity names
    const eatsPattern = /\[EATS?:\s*([\w-]+)\s*\]/gi;
    let match;
    while ((match = eatsPattern.exec(text)) !== null) {
        const target = match[1].trim();
        console.log('[Parser] Found EATS trigger:', target);
        triggers.push({ type: 'EATS', actor: actorId, target });
    }
    
    // [DIES] - actor is removed
    if (text.match(/\[DIES?\]/i)) {
        console.log('[Parser] Found DIES trigger');
        triggers.push({ type: 'DIES', actor: actorId });
    }
    
    // [FLEES] - actor leaves scene
    if (text.match(/\[FLEES?\]/i)) {
        console.log('[Parser] Found FLEES trigger');
        triggers.push({ type: 'FLEES', actor: actorId });
    }
    
    // [WITHERS] - actor gradually disappears (alias for DIES)
    if (text.match(/\[WITHERS?\]/i)) {
        console.log('[Parser] Found WITHERS trigger');
        triggers.push({ type: 'WITHERS', actor: actorId });
    }
    
    // [SPAWNS:entityId] - creates new entity
    const spawnsPattern = /\[SPAWNS?:\s*([\w-]+)\s*\]/gi;
    console.log('[Parser] Checking for SPAWNS patterns...');
    console.log('[Parser] Spawn regex test on text:', spawnsPattern.test(text));
    // Reset regex after test
    spawnsPattern.lastIndex = 0;
    while ((match = spawnsPattern.exec(text)) !== null) {
        const target = match[1].trim();
        console.log('[Parser] Found SPAWNS trigger:', target);
        console.log('[Parser] Full match:', match[0]);
        triggers.push({ type: 'SPAWNS', actor: actorId, target });
    }
    
    console.log('[Parser] Total triggers found:', triggers.length);
    return triggers;
}

function executeEcologicalActions(triggers) {
    // Execute parsed ecological triggers with delays for dramatic effect
    console.log(`[Ecology] Executing ${triggers.length} triggers:`, triggers);
    
    triggers.forEach((trigger, index) => {
        setTimeout(() => {
            console.log(`[Ecology] Executing trigger ${index + 1}/${triggers.length}:`, trigger);
            
            switch(trigger.type) {
                case 'EATS':
                    console.log(`[Ecology] ${trigger.actor} is eating ${trigger.target}`);
                    removeEntity(trigger.target);
                    console.log(`[Ecology] ${trigger.target} has been removed (eaten by ${trigger.actor})`);
                    break;
                case 'DIES':
                case 'FLEES':
                case 'WITHERS':
                    console.log(`[Ecology] ${trigger.actor} is ${trigger.type.toLowerCase()}`);
                    removeEntity(trigger.actor);
                    console.log(`[Ecology] ${trigger.actor} has been removed (${trigger.type})`);
                    break;
                case 'SPAWNS':
                    console.log(`[Ecology] ${trigger.actor} is spawning ${trigger.target}`);
                    const beforeCount = currentScenario.entities.length;
                    spawnEntity(trigger.target, trigger.actor);
                    const afterCount = currentScenario.entities.length;
                    if (afterCount > beforeCount) {
                        console.log(`[Ecology] ✓ ${trigger.target} successfully spawned by ${trigger.actor} (entities: ${beforeCount} → ${afterCount})`);
                    } else {
                        console.warn(`[Ecology] ✗ ${trigger.target} spawn failed (entities still: ${afterCount}, max: ${MAX_ENTITIES})`);
                    }
                    break;
                default:
                    console.error(`[Ecology] Unknown trigger type: ${trigger.type}`);
            }
        }, index * 1000); // Stagger actions by 1 second each
    });
}

async function generateWorldtext(scenario, entityId, vector, index=0) {
    console.log(`[Generate] Starting generation for ${entityId}, vector: ${vector}, index: ${index}`);
    
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
    
    // Get current entity list to avoid referencing removed entities
    const currentEntities = scenario.entities.map(e => e.id).join(', ');
    const currentEntityNames = scenario.entities.map(e => `${e.id} (${e.name})`).join(', ');
    
    // First, try local Ollama instance
    console.log('[Generate] Attempting Ollama...');
    try {
        const systemPrompt = `You are a RIPPLES worldtext generator. Generate a **first-person action statement** from the entity's perspective. 

REQUIREMENTS:
- If this entity is responding to another entity's action (see Initiating Action Text below):
  * Start with a state declaration: "I am [affected by the action]."
  * Example: If sun warmed the lichen → lichen starts with "I am warmed by the sun."
  * Then continue: "And then I [what happens next]."
- If generating initial action (no Initiating Action):
  * DO NOT repeat the seed-action text provided - it already happened
  * Continue with "and then..." to show what happens next
- 1-2 sentences total
- Direct, concrete actions - what the entity DOES, not feelings or thoughts
- No poetic language, no uncertainty, no questioning
- Use present tense ("I am", "I spread", "I flow")
- ONLY reference entities that currently exist in the scenario (see entity list below)

CRITICAL - ACTION DIVERSITY:
When generating ActionIndex 0 vs ActionIndex 1, create DISTINCTLY DIFFERENT actions - almost opposite choices:
- Active vs passive ("I hunt the ant" vs "I rest on a branch")
- Aggressive vs defensive ("I chase" vs "I hide")
- Expansive vs contractive ("I spread outward" vs "I pull inward")
- Moving vs staying ("I flow downstream" vs "I pool in eddies")
- Consuming vs producing ("I eat" vs "I spawn")

ECOLOGICAL TRIGGERS - Use when action clearly involves these outcomes:
- [EATS:entityId] - "and then I strike and eat the beetle. [EATS:beetle]" (ALWAYS include when explicitly eating/consuming)
- [DIES] - "and then my roots snap. [DIES]" (entity dies/killed)
- [FLEES] - "and then I bolt away. [FLEES]" (entity leaves permanently)
- [WITHERS] - "and then frost kills me. [WITHERS]" (gradual death)
- [SPAWNS:entityId] - "and then I drop spores. [SPAWNS:mushroom]" (creates new entity)

IMPORTANT: If the action involves eating/consuming another entity, ALWAYS include [EATS:entityId]. If the entity dies, flees, or withers, include the appropriate trigger.

You may invent new entities for SPAWNS (e.g., [SPAWNS:toad], [SPAWNS:fungus]) - the system creates them automatically.`;
        
        let contextSnippet = '';
        if (initiatingInfo && initiatingInfo.entityId && initiatingInfo.entityId !== entityId) {
            contextSnippet = `\nInitiating Entity: ${initiatingInfo.entityId}` +
                           `\nInitiating Action Index: ${initiatingInfo.index}` +
                           `\nInitiating Action Text: ${initiatingInfo.text}`;
        }
        
        let userPrompt = `Scenario: ${scenario.name}\nEntity: ${entityId}\nVector: ${vector}\nActionIndex: ${index}\nCurrent Entities: ${currentEntityNames}` + contextSnippet;
        if (latent) {
            userPrompt += `\nSeed-action text: ${latent}`;
        }

        const ollamaResp = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3.2',
                prompt: `${systemPrompt}\n\n${userPrompt}`,
                stream: false
            })
        });
        
        if (ollamaResp.ok) {
            const ollamaData = await ollamaResp.json();
            const text = ollamaData.response?.trim();
            if (text && text.length > 0) {
                console.log('[Ollama] ✓ Success:', text);
                return text;
            } else {
                console.warn('[Ollama] ✗ Empty response from Ollama');
            }
        } else {
            console.warn(`[Ollama] ✗ HTTP error: ${ollamaResp.status}`);
        }
    } catch (e) {
        console.warn('[Ollama] ✗ Error:', e.message);
    }
    
    // Fall back to OpenAI via serverless endpoint
    console.log('[Generate] Attempting OpenAI...');
    try {
        const resp = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scenarioName: scenario.name,
                entityId,
                vector,
                index,
                latent,
                initiatingInfo,
                currentEntities: currentEntityNames
            })
        });
        
        if (!resp.ok) {
            console.warn(`[OpenAI] ✗ HTTP error: ${resp.status}`);
        } else {
            const data = await resp.json();
            
            console.log('[OpenAI] Response data:', data);
            
            // If API returned text successfully, use it
            if (data.text && data.text.length > 0) {
                console.log('[OpenAI] ✓ Success:', data.text);
                return data.text;
            } else if (data.fallback) {
                console.warn('[OpenAI] ✗ API indicated fallback:', data.error || 'No reason given');
            } else {
                console.warn('[OpenAI] ✗ Empty or invalid response');
            }
        }
    } catch (e) {
        console.error('[OpenAI] ✗ Error:', e);
    }

    // Both APIs failed or returned empty: procedural fallback
    console.warn('[Procedural] ⚠ Using procedural fallback');
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
    
    // No suffix needed - keep actions short and direct
    return variation;
}

function getFallbackVariations(vector) {
    // Hardcoded fallback in case JSON load fails
    const fallback = {
        ACTION: [
            `I move toward warmth.`,
            `I shift position.`,
            `I absorb moisture.`,
            `I spread outward.`,
            `I hold still.`
        ]
    };
    return fallback[vector] || [];
}

// flag showing we are currently regenerating latents
let generatingLatents = false;

// initialize on load
window.addEventListener('DOMContentLoaded', init);

// Vercel serverless function for OpenAI worldtext generation
export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ 
            error: 'API key not configured',
            fallback: true 
        });
    }

    try {
        const { 
            scenarioName, 
            entityId, 
            vector, 
            index, 
            latent,
            initiatingInfo,
            currentEntities 
        } = req.body;

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
        
        let userPrompt = `Scenario: ${scenarioName}\nEntity: ${entityId}\nVector: ${vector}\nActionIndex: ${index}\nCurrent Entities: ${currentEntities || 'N/A'}` + contextSnippet;
        if (latent) {
            userPrompt += `\nSeed-action text: ${latent}`;
        }

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: 500,
                temperature: 0.9
            })
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            console.error('[Serverless] OpenAI API error:', errorData);
            return res.status(200).json({ 
                error: 'OpenAI API error',
                fallback: true,
                details: errorData
            });
        }

        const data = await openaiResponse.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        
        console.log('[Serverless] OpenAI returned:', text ? `${text.substring(0, 50)}...` : 'empty');
        
        if (!text || text.length === 0) {
            console.warn('[Serverless] Empty response from OpenAI');
            return res.status(200).json({ 
                text: null,
                fallback: true,
                error: 'Empty response from OpenAI'
            });
        }

        console.log('[Serverless] Success, returning text');
        return res.status(200).json({ 
            text,
            fallback: false 
        });

    } catch (error) {
        console.error('[Serverless] Generation error:', error);
        return res.status(500).json({ 
            error: error.message,
            fallback: true 
        });
    }
}

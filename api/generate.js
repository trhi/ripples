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
            initiatingInfo 
        } = req.body;

        const systemPrompt = `You are a RIPPLES worldtext generator. Follow the specification exactly: produce a total of 10-20 words in a **first-person** poetic description from the perspective of the given entity when the provided vector is applied. Use uncertainty markers and state-focused language. Do not write in third person.`;
        
        let contextSnippet = '';
        if (initiatingInfo && initiatingInfo.entityId && initiatingInfo.entityId !== entityId) {
            contextSnippet = `\nInitiating Entity: ${initiatingInfo.entityId}` +
                           `\nInitiating Action Index: ${initiatingInfo.index}` +
                           `\nInitiating Action Text: ${initiatingInfo.text}`;
        }
        
        let userPrompt = `Scenario: ${scenarioName}\nEntity: ${entityId}\nVector: ${vector}\nActionIndex: ${index}` + contextSnippet;
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
                max_tokens: 500
            })
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            console.error('OpenAI API error:', errorData);
            return res.status(openaiResponse.status).json({ 
                error: 'OpenAI API error',
                fallback: true,
                details: errorData
            });
        }

        const data = await openaiResponse.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        
        if (!text) {
            return res.status(200).json({ 
                text: null,
                fallback: true 
            });
        }

        return res.status(200).json({ 
            text,
            fallback: false 
        });

    } catch (error) {
        console.error('Generation error:', error);
        return res.status(500).json({ 
            error: error.message,
            fallback: true 
        });
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    try {
        const API_KEY = process.env.ZAI_API_KEY;
        const API_URL = 'https://api.z.ai/v1/chat/completions';

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'glm-4',
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un asistente de productividad especializado en gestión del tiempo, hábitos y productividad personal. Generates respuestas en español, estructuradas y prácticas.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('AI API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

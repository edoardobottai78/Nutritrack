export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { description } = req.body || {};
  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Missing description' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `Stima i macronutrienti per il seguente pasto. Rispondi SOLO con un oggetto JSON valido, nessun testo extra.

Pasto: "${description.trim()}"

Formato risposta:
{"kcal": <numero>, "proteine": <numero>, "carboidrati": <numero>, "grassi": <numero>}

Tutti i valori sono numeri interi. "carboidrati" include zuccheri. Stima ragionevole per una porzione normale.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 128,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(502).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text?.trim() || '';

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Invalid response from AI', raw: text });

    const macros = JSON.parse(match[0]);
    const kcal = Math.round(Number(macros.kcal) || 0);
    const proteine = Math.round(Number(macros.proteine) || 0);
    const carboidrati = Math.round(Number(macros.carboidrati) || 0);
    const grassi = Math.round(Number(macros.grassi) || 0);

    return res.status(200).json({ kcal, proteine, carboidrati, grassi });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}

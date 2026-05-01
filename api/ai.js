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

  const systemPrompt = `Sei un nutrizionista esperto. Ricevi una descrizione di alimenti consumati dall'utente e devi stimare i valori nutrizionali totali.
Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo, senza backtick, senza markdown. Formato esatto:
{"kcal": numero_intero, "carboidrati": numero_intero, "proteine": numero_intero, "grassi": numero_intero}
Basa le stime su grammature standard italiane per alimenti comuni. Se l'utente non specifica la quantità, usa una porzione standard.`;

  const userMessage = `Ho mangiato: ${description.trim()}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 128,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(502).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text?.trim() || '';

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return res.status(502).json({ error: 'Invalid response from AI', raw: text });

    const macros = JSON.parse(match[0]);
    const kcal        = Math.round(Number(macros.kcal)        || 0);
    const proteine    = Math.round(Number(macros.proteine)    || 0);
    const carboidrati = Math.round(Number(macros.carboidrati) || 0);
    const grassi      = Math.round(Number(macros.grassi)      || 0);

    return res.status(200).json({ kcal, proteine, carboidrati, grassi });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}

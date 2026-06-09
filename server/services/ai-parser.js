const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are a quality engineering expert. Analyze this document and extract all inspection characteristics.

Return ONLY valid JSON in this exact structure:
{
  "part_number": "string or null",
  "revision": "string or null",
  "document_type": "control_plan|drawing|spec_sheet|inspection_report|other",
  "extraction_notes": "brief description of what was found",
  "characteristics": [
    {
      "name": "characteristic name",
      "description": "what is being measured",
      "char_type": "variable or attribute",
      "nominal": number or null,
      "usl": number or null,
      "lsl": number or null,
      "unit": "mm, in, degrees, etc or null",
      "gauge_type": "micrometer, caliper, CMM, go/no-go, visual, etc or null",
      "critical": true or false,
      "ai_confidence": "high, medium, or low",
      "ai_notes": "any ambiguity or assumptions made"
    }
  ]
}

Rules:
- variable = measured numeric value (length, diameter, weight, temperature, etc.)
- attribute = pass/fail judgment (visual, go/no-go, presence/absence)
- Extract EVERY characteristic, dimension, tolerance, and inspection point you find
- For bilateral tolerances like 25.4 ± 0.05: nominal=25.4, usl=25.45, lsl=25.35
- For unilateral tolerances like ≥ 50: set only usl or lsl as appropriate
- Mark critical=true for safety-critical, functional, or explicitly marked CTQ characteristics
- ai_confidence: high=clearly stated with values, medium=inferred, low=ambiguous
- Do NOT add characteristics you cannot find evidence for`;

async function parseWithVision(fileBuffer, mimeType) {
  const base64 = fileBuffer.toString('base64');
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: EXTRACTION_PROMPT }
      ]
    }]
  });
  return response.content[0].text;
}

async function parseWithText(text) {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nDocument content:\n${text.slice(0, 80000)}`
    }]
  });
  return response.content[0].text;
}

async function extractTextFromPDF(fileBuffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  } catch (e) {
    return null;
  }
}

async function extractTextFromExcel(fileBuffer) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    let text = '';
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      text += `\n--- Sheet: ${sheetName} ---\n`;
      text += XLSX.utils.sheet_to_csv(sheet);
    }
    return text;
  } catch (e) {
    return null;
  }
}

function parseAIResponse(rawText) {
  // Strip markdown code fences if present
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found in AI response');
  return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
}

async function parseDocument(fileBuffer, mimeType, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  let rawText;

  // Excel / CSV — extract text then send as text prompt
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    if (ext === 'csv') {
      rawText = await parseWithText(fileBuffer.toString('utf8'));
    } else {
      const text = await extractTextFromExcel(fileBuffer);
      if (!text) throw new Error('Could not read Excel file');
      rawText = await parseWithText(text);
    }
  }
  // Images — send directly as vision
  else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    rawText = await parseWithVision(fileBuffer, mimeType || 'image/jpeg');
  }
  // PDF — try text extraction first, fall back to vision
  else if (ext === 'pdf') {
    const pdfText = await extractTextFromPDF(fileBuffer);
    if (pdfText && pdfText.trim().length > 100) {
      rawText = await parseWithText(pdfText);
    } else {
      // Scanned PDF — treat first page as image via vision
      rawText = await parseWithVision(fileBuffer, 'application/pdf');
    }
  }
  else {
    // Try as plain text
    rawText = await parseWithText(fileBuffer.toString('utf8'));
  }

  return { rawText, parsed: parseAIResponse(rawText) };
}

module.exports = { parseDocument };

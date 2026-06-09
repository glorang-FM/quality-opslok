/**
 * AI Document Parser — Quality OpsLok
 * Uses Claude to extract inspection characteristics from uploaded documents.
 * Supports: PDF, images of drawings, Excel control plans, Word specs.
 */

const Anthropic = require('@anthropic-ai/sdk');
const XLSX = require('xlsx');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are a quality engineering assistant specializing in extracting inspection characteristics from technical documents.

Analyze this document carefully and extract ALL measurable inspection characteristics/dimensions.

For each characteristic found, extract:
- name: clear descriptive name (e.g., "Outer Diameter", "Wall Thickness", "Tensile Strength", "Surface Roughness Ra")
- description: additional context or note from the document (optional)
- nominal: target/nominal value as a number (null if not specified)
- usl: upper specification limit as a number (null if not specified)
- lsl: lower specification limit as a number (null if not specified)
- unit: unit of measure — mm, in, °F, °C, Ra, lbs, kg, psi, MPa, etc. (null if not specified)
- gauge_type: suggested measurement instrument — caliper, micrometer, CMM, surface profilometer, hardness tester, torque wrench, etc. (null if unclear)
- critical: true if document marks this as a critical/key/safety characteristic (CC, KC, ★), false otherwise
- char_type: "variable" if a measured number, "attribute" if visual or go/no-go
- ai_confidence: "high" if clearly stated, "medium" if inferred, "low" if uncertain
- ai_notes: any extraction notes, ambiguities, or things the engineer should verify

Also extract document-level metadata:
- part_number: if found in the document
- revision: document revision level if found
- document_type: "drawing" | "control_plan" | "spec_sheet" | "ppap" | "other"
- extraction_notes: overall notes about completeness or issues encountered

Return ONLY valid JSON in this exact structure — no markdown, no explanation, just JSON:
{
  "characteristics": [
    {
      "name": "...",
      "description": "...",
      "nominal": 25.00,
      "usl": 25.10,
      "lsl": 24.90,
      "unit": "mm",
      "gauge_type": "digital caliper",
      "critical": false,
      "char_type": "variable",
      "ai_confidence": "high",
      "ai_notes": "..."
    }
  ],
  "part_number": "...",
  "revision": "...",
  "document_type": "drawing",
  "extraction_notes": "..."
}

Important rules:
- Do NOT guess values — use null for anything not explicitly stated
- For ± tolerances: nominal=X, usl=X+tol, lsl=X-tol
- For min/max only: nominal=null, usl=max, lsl=min
- Extract ALL characteristics, even obvious ones like overall dimensions
- If a table of characteristics exists (like an AIAG control plan), extract every row`;

/**
 * Parse a PDF or image file using Claude's vision
 */
async function parseWithVision(fileBuffer, mimeType, filename) {
  const base64 = fileBuffer.toString('base64');

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 }
        },
        {
          type: 'text',
          text: EXTRACTION_PROMPT + `\n\nFilename: ${filename}`
        }
      ]
    }]
  });

  return response.content[0].text;
}

/**
 * Parse an Excel file — extract text then send to Claude
 */
async function parseExcel(fileBuffer, filename) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  let textContent = `Excel file: ${filename}\n\n`;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    textContent += `Sheet: ${sheetName}\n${csv}\n\n`;
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: EXTRACTION_PROMPT + `\n\nDocument content:\n${textContent}`
    }]
  });

  return response.content[0].text;
}

/**
 * Parse a PDF as text (fallback when vision not ideal for dense text PDFs)
 */
async function parsePdfText(fileBuffer, filename) {
  let textContent;
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    textContent = data.text;
  } catch (e) {
    // If pdf-parse fails, try vision
    return parseWithVision(fileBuffer, 'application/pdf', filename);
  }

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: EXTRACTION_PROMPT + `\n\nDocument text extracted from PDF "${filename}":\n${textContent}`
    }]
  });

  return response.content[0].text;
}

/**
 * Main parse function — routes to the right parser based on file type
 */
async function parseDocument(fileBuffer, mimeType, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  let rawOutput;

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    rawOutput = await parseExcel(fileBuffer, filename);
  } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    const imgMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    rawOutput = await parseWithVision(fileBuffer, imgMime, filename);
  } else if (ext === 'pdf') {
    // Try vision first for drawings (better at GD&T), text for dense spec sheets
    // Heuristic: if file < 500kb, likely a drawing → vision
    if (fileBuffer.length < 512000) {
      rawOutput = await parseWithVision(fileBuffer, 'application/pdf', filename);
    } else {
      rawOutput = await parsePdfText(fileBuffer, filename);
    }
  } else {
    // Attempt text extraction for docx etc.
    rawOutput = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: EXTRACTION_PROMPT + `\n\nFilename: ${filename}\nNote: This file type (${ext}) could not be parsed directly. Please analyze based on filename and any recognizable content.`
      }]
    }).then(r => r.content[0].text);
  }

  // Parse JSON from AI response
  let parsed;
  try {
    // Strip any accidental markdown code fences
    const clean = rawOutput.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (e) {
    throw new Error(`AI returned non-JSON response: ${rawOutput.slice(0, 200)}`);
  }

  return { rawOutput, parsed };
}

module.exports = { parseDocument };

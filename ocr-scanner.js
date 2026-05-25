// ocr-scanner.js
// Responsabilidad única: extraer la cuota de una imagen de boleto
const CUOTA_RE = /(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})/g;

// ── Google Vision ─────────────────────────────────────────────────────────────
async function extractTextFromImage(imageBase64) {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Vision API: ${res.status}`);
  const data = await res.json();
  const text = data.responses && data.responses[0] && data.responses[0].fullTextAnnotation && data.responses[0].fullTextAnnotation.text;
  if (!text) throw new Error('No se detectó texto en la imagen');
  return text.trim();
}

// ── Extraer cuota del texto OCR ───────────────────────────────────────────────
function extraerCuota(text) {
  // Winamax: cuota total explícita
  const ctM = text.match(/Cuota total\s+([\d,\.]+)/i);
  if(ctM) return parseFloat(ctM[1].replace(',','.'));

  // Winamax MYMATCH: cuota al lado de MYMATCH
  const mmM = text.match(/MYMATCH\s+([\d,\.]+)/i);
  if(mmM) return parseFloat(mmM[1].replace(',','.'));

  // Bet365 CREAR APUESTA
  const caM = text.match(/CREAR APUESTA\s+([\d\.]+)/i);
  if(caM) return parseFloat(caM[1]);

  // Bet365 bullet: • Texto 1.22
  const bM = text.match(/•[^•\n]{2,50}?\s+(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})\s/);
  if(bM) return parseFloat(bM[1]);

  // Bet365 combinada: bloque de cuotas al final en líneas separadas
  // La cuota total es siempre la más alta del bloque
  const todasCuotas = [];
  const lineas = text.split('\n').map(l => l.trim());
  for(const l of lineas){
    const m = l.match(/^(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})$/);
    if(m) todasCuotas.push(parseFloat(m[1]));
  }
  if(todasCuotas.length > 1) return Math.max(...todasCuotas);
  if(todasCuotas.length === 1) return todasCuotas[0];

  // Último recurso: ignorar líneas de mercado
  const lineasRev = text.split(/\n|\s{2,}/);
  for(const linea of lineasRev.reverse()){
    if(/más de|menos de|over|under/i.test(linea)) continue;
    const m = linea.match(/(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})/);
    if(m) return parseFloat(m[1]);
  }
  return null;
}

// ── Detectar casa de apuestas ─────────────────────────────────────────────────
function detectarCasa(text) {
  if (/reutilizar selecciones|crear apuesta/i.test(text)) return 'Bet365';
  if (/mymatch/i.test(text)) return 'Winamax';
  if (/codere/i.test(text)) return 'Codere';
  if (/betway/i.test(text)) return 'Betway';
  if (/1xbet/i.test(text)) return '1xBet';
  return '';
}

// ── Función principal: procesar imagen ───────────────────────────────────────
async function procesarImagen(imageBase64) {
  const texto = await extractTextFromImage(imageBase64);
  console.log('OCR RAW:', texto);
  const cuota = extraerCuota(texto);
  const casa  = detectarCasa(texto);
  return { cuota, casa, texto_raw: texto };
}

// ── Convertir File a base64 ───────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

  // Winamax MYMATCH
  const mmM = text.match(/MYMATCH\s+([\d,\.]+)/i);
  if(mmM) return parseFloat(mmM[1].replace(',','.'));

  // Bet365: recoger TODAS las cuotas de bloque
  // CREAR APUESTA X → cuota del grupo
  // Selección suelta X → cuota individual
  // Cuota total = producto de todos los bloques
  const bloques = [];

  // Cuotas de CREAR APUESTA
  const crearRe = /CREAR APUESTA\s+([\d\.]+)/gi;
  let m;
  while((m = crearRe.exec(text)) !== null) {
    bloques.push(parseFloat(m[1]));
  }

  // Cuotas de selecciones sueltas (bullet ○ o •)
  // Patrón: nombre/mercado seguido de cuota al final de línea
  const selRe = /^[○•°]\s*.+?\s+(1\.[0-9]{2,3}|[2-9]\.[0-9]{2,3})\s*$/gm;
  while((m = selRe.exec(text)) !== null) {
    bloques.push(parseFloat(m[1]));
  }

  if(bloques.length > 1) {
    // Calcular cuota total = producto de todos los bloques
    const total = bloques.reduce((a, b) => a * b, 1);
    return Math.round(total * 100) / 100;
  }
  if(bloques.length === 1) return bloques[0];

  // Bet365 columna final (triple, acumulada)
  const lineas = text.split('\n').map(l => l.trim());
  const cuotasFinales = [];
  for(const l of lineas){
    const lm = l.match(/^(1\.[0-9]{2,3}|[2-9]\.[0-9]{2,3})$/);
    if(lm) cuotasFinales.push(parseFloat(lm[1]));
  }
  if(cuotasFinales.length > 1) return Math.max(...cuotasFinales);
  if(cuotasFinales.length === 1) return cuotasFinales[0];

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

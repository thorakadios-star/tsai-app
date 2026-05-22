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
  const text = data.responses?.[0]?.fullTextAnnotation?.text;
  if (!text) throw new Error('No se detectó texto en la imagen');
  return text.trim();
}

// ── Extraer cuota del texto OCR ───────────────────────────────────────────────
// Estrategia: buscar la cuota más prominente
// - En Bet365: aparece justo después del nombre del equipo o mercado
// - En Winamax: aparece al lado de MYMATCH o al final de la línea
function extraerCuota(text) {
  const matches = [...text.matchAll(CUOTA_RE)].map(m => parseFloat(m[1]));
  if (!matches.length) return null;

  // Filtrar cuotas irreales (muy bajas o muy altas)
  const validas = matches.filter(c => c > 1.05 && c < 50);
  if (!validas.length) return null;

  // Si hay "Cuota total" en el texto (Winamax), buscarla directamente
  const cuotaTotalM = text.match(/Cuota total\s+([\d,\.]+)/i);
  if (cuotaTotalM) return parseFloat(cuotaTotalM[1].replace(',', '.'));

  // Si hay CREAR APUESTA (Bet365), la cuota del grupo
  const crearM = text.match(/CREAR APUESTA\s+([\d\.]+)/i);
  if (crearM) {
    const c = parseFloat(crearM[1]);
    if (c > 1.05) return c;
  }

  // Si hay un solo evento: buscar la cuota junto a bullet o selección
  const bulletM = text.match(/•[^•]{2,60}?(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})/);
  if (bulletM) return parseFloat(bulletM[1]);

  // Fallback: la cuota más alta (suele ser la total en combinadas)
  return Math.max(...validas);
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

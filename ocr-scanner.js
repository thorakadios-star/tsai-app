// ocr-scanner.js
// Responsabilidad única: extraer la cuota de una imagen de boleto
const CUOTA_RE = /(1\.[0-9]{2,3}|[2-9]\.[0-9]{2})/g;

// ── OCR SPACE ─────────────────────────────────────────────────────────────
async function extractTextFromImage(imageBase64) {
  const formData = new FormData();
  formData.append('base64Image', 'data:image/jpeg;base64,' + imageBase64);
  formData.append('apikey', 'K86282425588957');
  formData.append('language', 'spa');
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error(`OCR.space error: ${res.status}`);
  const data = await res.json();

  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage || 'Error OCR');

  const text = data.ParsedResults && data.ParsedResults[0] && data.ParsedResults[0].ParsedText;
  if (!text) throw new Error('No se detectó texto en la imagen');
  return text.trim();
}

// ── Extraer cuota del texto OCR ───────────────────────────────────────────────
function extraerCuota(text) {
  // Normalizar comas a puntos
  const t = text.replace(/(\d),(\d)/g, '$1.$2');

  // Winamax: cuota total explícita — siempre fiable
 const ctM = t.match(/Cuota total[\s\S]*?([\d\.]{3,7})\s*$/i);
if(ctM) return parseFloat(ctM[1]);

  // Recoger TODOS los X.XX del texto
  const todas = [];
  const re = /\b([1-9]\.[0-9]{2,3})\b/g;
  let m;
  while((m = re.exec(t)) !== null) todas.push(parseFloat(m[1]));

  console.log('CUOTAS ENCONTRADAS:', todas);

  if(!todas.length) return null;
  if(todas.length === 1) return todas[0];

  // Bet365 CREAR APUESTA — multiplicar todas
  const caM = t.match(/CREAR APUESTA\s+([\d\.]+)/i);
  if(caM) return Math.round(todas.reduce((a,b) => a*b, 1) * 100) / 100;

  // Winamax MYMATCH con una sola cuota — devolver directamente
  const mmM = t.match(/MYMATCH\s+([\d\.]+)/i);
  if(mmM && todas.length === 1) return parseFloat(mmM[1]);

  // Multiplicar todas
  return Math.round(todas.reduce((a,b) => a*b, 1) * 100) / 100;
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

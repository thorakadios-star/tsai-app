// picks.js
// Lógica de negocio: crear boleto, publicar en chat, liquidar, actualizar stats

// ── Crear boleto + publicar en chat ──────────────────────────────────────────
async function crearPick({ tipster_id, canal_id, datos, imagen_url }) {
  // 1. Insertar boleto
  const { data: boleto, error: bErr } = await sb.from('boletos').insert({
    tipster_id,
    canal_id,
    casa_apuestas:   datos.casa_apuestas || null,
    cuota_total:     parseFloat(datos.cuota) || null,
    stake:           parseFloat(datos.stake) || null,
    tipo_apuesta:    datos.tipo_partido,        // live / pre-partido
    tipo_acceso:     datos.categoria,           // gratis / premium
    confianza:       datos.nivel_confianza,     // MAX / ALTA / MEDIA / BAJA
    nivel_confianza: datos.nivel_confianza,
    analisis:        datos.analisis || null,
    imagen_url:      imagen_url || null,
    estado:          'pendiente',
    fuente:          'ocr',
    fecha_procesado: new Date().toISOString(),
  }).select('id').single();

  if (bErr) throw new Error('Error creando boleto: ' + bErr.message);

  // 2. Publicar mensaje en el canal del tipster
  const { error: mErr } = await sb.from('mensajes').insert({
    canal_id,
    tipster_id,
    boleto_id:  boleto.id,
    tipo:       'pick',
    imagen_url: imagen_url || null,
    contenido:  JSON.stringify({
      casa:       datos.casa_apuestas,
      cuota:      datos.cuota,
      stake:      datos.stake,
      confianza:  datos.nivel_confianza,
      tipo:       datos.tipo_partido,
      categoria:  datos.categoria,
      analisis:   datos.analisis,
    }),
    created_at: new Date().toISOString(),
  });

  if (mErr) console.warn('Mensaje no publicado:', mErr.message);

  return boleto.id;
}

// ── Liquidar pick ─────────────────────────────────────────────────────────────
async function liquidarPick(boletoId, resultado) {
  // resultado: 'ganado' | 'perdido' | 'nulo'

  // 1. Leer boleto
  const { data: boleto, error: rErr } = await sb
    .from('boletos')
    .select('tipster_id, stake, cuota_total, tipo_acceso, fecha_procesado')
    .eq('id', boletoId)
    .single();

  if (rErr || !boleto) throw new Error('Boleto no encontrado');

  // 2. Calcular profit
  const stake = parseFloat(boleto.stake) || 0;
  const cuota = parseFloat(boleto.cuota_total) || 0;
  let profit  = 0;
  if      (resultado === 'ganado') profit = Math.round((stake * cuota - stake) * 100) / 100;
  else if (resultado === 'perdido') profit = -stake;
  else if (resultado === 'nulo')    profit = 0; // devuelve stake

  // 3. Actualizar boleto
  const { error: uErr } = await sb.from('boletos').update({
    estado:     resultado,
    profit,
    settled_at: new Date().toISOString(),
  }).eq('id', boletoId);

  if (uErr) throw new Error('Error actualizando boleto: ' + uErr.message);

  // 4. Actualizar stats del tipster
  await actualizarStats(boleto.tipster_id, resultado, stake, profit, boleto.tipo_acceso, boleto.fecha_procesado);

  return profit;
}

// ── Actualizar estadísticas ───────────────────────────────────────────────────
async function actualizarStats(tipster_id, resultado, stake, profit, categoria, fecha_procesado) {
  const fecha = (fecha_procesado || new Date().toISOString()).split('T')[0];

  // 1. Actualizar tipsters_profiles (stats globales)
  const { data: perfil } = await sb
    .from('tipsters_profiles')
    .select('wins, losses, voids, total_picks, profit_units, total_staked')
    .eq('id', tipster_id)
    .single();

  if (perfil) {
    const wins   = perfil.wins   + (resultado === 'ganado'  ? 1 : 0);
    const losses = perfil.losses + (resultado === 'perdido' ? 1 : 0);
    const voids  = perfil.voids  + (resultado === 'nulo'    ? 1 : 0);
    const total_picks   = perfil.total_picks + 1;
    const profit_units  = parseFloat(perfil.profit_units) + profit;
    const total_staked  = parseFloat(perfil.total_staked)  + stake;
    const win_rate_pct  = total_picks > 0 ? Math.round((wins / total_picks) * 10000) / 100 : 0;
    const yield_pct     = total_staked > 0 ? Math.round((profit_units / total_staked) * 10000) / 100 : 0;

    await sb.from('tipsters_profiles').update({
      wins, losses, voids, total_picks, profit_units,
      total_staked, win_rate_pct, yield_pct,
      updated_at: new Date().toISOString(),
    }).eq('id', tipster_id);
  }

  // 2. Upsert tipster_daily_stats (stats diarias por categoría)
  const cat = categoria === 'premium' ? 'premium' : 'free';

  const { data: existing } = await sb
    .from('tipster_daily_stats')
    .select('*')
    .eq('tipster_id', tipster_id)
    .eq('fecha', fecha)
    .eq('categoria', cat)
    .single();

  if (existing) {
    const ganados  = existing.picks_ganados  + (resultado === 'ganado'  ? 1 : 0);
    const perdidos = existing.picks_perdidos + (resultado === 'perdido' ? 1 : 0);
    const nulos    = existing.picks_nulos    + (resultado === 'nulo'    ? 1 : 0);
    const total    = existing.total_picks + 1;
    const p_units  = parseFloat(existing.profit_units) + profit;
    const staked   = parseFloat(existing.total_staked)  + stake;
    const yield_p  = staked > 0 ? Math.round((p_units / staked) * 10000) / 100 : 0;
    const roi      = staked > 0 ? Math.round((p_units / staked) * 10000) / 100 : 0;

    await sb.from('tipster_daily_stats').update({
      picks_ganados: ganados, picks_perdidos: perdidos, picks_nulos: nulos,
      total_picks: total, profit_units: p_units, total_staked: staked,
      yield_pct: yield_p, roi_pct: roi,
    }).eq('id', existing.id);
  } else {
    await sb.from('tipster_daily_stats').insert({
      tipster_id, fecha, categoria: cat,
      total_picks:    1,
      picks_ganados:  resultado === 'ganado'  ? 1 : 0,
      picks_perdidos: resultado === 'perdido' ? 1 : 0,
      picks_nulos:    resultado === 'nulo'    ? 1 : 0,
      profit_units:   profit,
      total_staked:   stake,
      yield_pct:      stake > 0 ? Math.round((profit / stake) * 10000) / 100 : 0,
      roi_pct:        stake > 0 ? Math.round((profit / stake) * 10000) / 100 : 0,
    });
  }
}

// ── Cargar picks pendientes de un tipster ─────────────────────────────────────
async function cargarPicksPendientes(tipster_id) {
  const { data, error } = await sb
    .from('boletos')
    .select('id, casa_apuestas, cuota_total, stake, estado, confianza, tipo_apuesta, tipo_acceso, analisis, fecha_procesado, profit')
    .eq('tipster_id', tipster_id)
    .eq('estado', 'pendiente')
    .order('fecha_procesado', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// ── Cargar canales de un tipster ──────────────────────────────────────────────
async function cargarCanales(tipster_id) {
  const query = tipster_id
    ? sb.from('canales').select('id, nombre, tipo, tipster_id').eq('tipster_id', tipster_id)
    : sb.from('canales').select('id, nombre, tipo, tipster_id, tipsters_profiles(display_name)');
  const { data, error } = await query.eq('activo', true);
  if (error) throw new Error(error.message);
  return data || [];
}

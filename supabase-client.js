// supabase-client.js
// Único punto de configuración — cambiar credenciales solo aquí

const SUPABASE_URL = 'https://tpjgmqsdypzvhrdxhttz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwamdtcXNkeXB6dmhyZHhodHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjQxMDAsImV4cCI6MjA5NDcwMDEwMH0.QSLAi_x_cOiXqdXgUmXrysvANY3xQcS-TyNXanBETGQ';
const VISION_KEY   = 'AIzaSyAwrz7y9fyIc8VN408lOI_b9nrEuYbSpEE';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials. ' +
    'Ensure SUPABASE_URL and SUPABASE_KEY are defined in your .env file.'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;

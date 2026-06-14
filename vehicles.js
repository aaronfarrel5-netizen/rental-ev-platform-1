import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/vehicles
// Fetch all vehicles with optional query-string filters.
//
// Supported query parameters:
//   type         – 'conventional' | 'ev'
//   category     – 'car' | 'motorcycle'
//   transmission – e.g. 'automatic' | 'manual'
//   is_available – 'true' | 'false'
//   is_popular   – 'true' | 'false'
//   min_price    – minimum price_per_day (number)
//   max_price    – maximum price_per_day (number)
//   sort_by      – column name to sort on  (default: 'created_at')
//   order        – 'asc' | 'desc'          (default: 'desc')
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const {
      type,
      category,
      transmission,
      is_available,
      is_popular,
      min_price,
      max_price,
      sort_by = 'created_at',
      order = 'desc',
    } = req.query;

    // Whitelist sortable columns to prevent SQL injection via order-by
    const SORTABLE_COLUMNS = [
      'created_at',
      'price_per_day',
      'rating',
      'name',
      'passenger_capacity',
    ];

    const sortColumn = SORTABLE_COLUMNS.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    let query = supabase
      .from('vehicles')
      .select('*')
      .order(sortColumn, { ascending: sortOrder === 'asc' });

    // Apply optional filters
    if (type) {
      query = query.eq('type', type);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (transmission) {
      query = query.eq('transmission', transmission);
    }
    if (is_available !== undefined) {
      query = query.eq('is_available', is_available === 'true');
    }
    if (is_popular !== undefined) {
      query = query.eq('is_popular', is_popular === 'true');
    }
    if (min_price !== undefined) {
      query = query.gte('price_per_day', Number(min_price));
    }
    if (max_price !== undefined) {
      query = query.lte('price_per_day', Number(max_price));
    }

    const { data, error } = await query;

    if (error) {
      console.error('[vehicles] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error('[vehicles] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/vehicles/:id
// Fetch a single vehicle by primary key.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // PostgREST returns code PGRST116 when no row is found with .single()
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: `Vehicle with id '${id}' not found.` });
      }
      console.error('[vehicles/:id] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[vehicles/:id] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;

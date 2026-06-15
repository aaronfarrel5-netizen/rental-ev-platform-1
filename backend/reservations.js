import { Router } from 'express';
import supabase from '../db/supabase.js';

const router = Router();

// ---------------------------------------------------------------------------
// Validation helper
// Returns an array of error strings; empty array means the payload is valid.
// ---------------------------------------------------------------------------
function validateReservationPayload(body, requireAll = true) {
  const errors = [];

  const REQUIRED_FIELDS = [
    'vehicle_id',
    'full_name',
    'phone_number',
    'id_number',
    'email',
    'start_date',
    'end_date',
    'pickup_location',
    'total_days',
    'total_price',
  ];

  // On creation (POST) every field is mandatory.
  // On update (PUT) we only validate the fields that were actually provided.
  const fieldsToCheck = requireAll
    ? REQUIRED_FIELDS
    : REQUIRED_FIELDS.filter((f) => body[f] !== undefined);

  for (const field of fieldsToCheck) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      errors.push(`'${field}' is required and cannot be empty.`);
    }
  }

  // Type-level checks (only when the field is present)
  if (body.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push("'email' must be a valid email address.");
  }

  if (body.total_days !== undefined && (isNaN(body.total_days) || Number(body.total_days) < 1)) {
    errors.push("'total_days' must be a positive integer.");
  }

  if (body.total_price !== undefined && (isNaN(body.total_price) || Number(body.total_price) < 0)) {
    errors.push("'total_price' must be a non-negative number.");
  }

  if (body.status !== undefined) {
    const VALID_STATUSES = ['pending', 'confirmed', 'cancelled'];
    if (!VALID_STATUSES.includes(body.status)) {
      errors.push(`'status' must be one of: ${VALID_STATUSES.join(', ')}.`);
    }
  }

  if (body.start_date && body.end_date) {
    const start = new Date(body.start_date);
    const end = new Date(body.end_date);
    if (isNaN(start.getTime())) errors.push("'start_date' is not a valid date.");
    if (isNaN(end.getTime())) errors.push("'end_date' is not a valid date.");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
      errors.push("'end_date' must be strictly after 'start_date'.");
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// GET /api/reservations
// Fetch all reservations, joining the related vehicle row.
//
// Supported query parameters:
//   status   – 'pending' | 'confirmed' | 'cancelled'
//   sort_by  – 'created_at' | 'start_date' | 'total_price'  (default: 'created_at')
//   order    – 'asc' | 'desc'                                (default: 'desc')
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, sort_by = 'created_at', order = 'desc' } = req.query;

    const SORTABLE_COLUMNS = ['created_at', 'start_date', 'end_date', 'total_price', 'total_days'];
    const sortColumn = SORTABLE_COLUMNS.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    let query = supabase
      .from('reservations')
      // Pull all reservation columns plus the full vehicle object via FK relation
      .select(`
        *,
        vehicle:vehicle_id (
          id,
          name,
          type,
          category,
          transmission,
          fuel_type,
          price_per_day,
          image_url,
          is_available
        )
      `)
      .order(sortColumn, { ascending: sortOrder === 'asc' });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[reservations] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error('[reservations] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reservations/:id
// Fetch a single reservation by primary key, including the vehicle relation.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        vehicle:vehicle_id (
          id,
          name,
          type,
          category,
          transmission,
          fuel_type,
          price_per_day,
          image_url,
          is_available
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: `Reservation with id '${id}' not found.` });
      }
      console.error('[reservations/:id] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[reservations/:id] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reservations
// Create a new reservation.
// The 'status' field defaults to 'pending' if not provided.
//
// Required body fields:
//   vehicle_id, full_name, phone_number, id_number, email,
//   start_date, end_date, pickup_location, total_days, total_price
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Apply strict validation — all required fields must be present
    const validationErrors = validateReservationPayload(body, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    // Confirm the referenced vehicle exists
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, is_available')
      .eq('id', body.vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return res.status(404).json({
        success: false,
        message: `Vehicle with id '${body.vehicle_id}' does not exist.`,
      });
    }

    const payload = {
      vehicle_id: body.vehicle_id,
      full_name: body.full_name.trim(),
      phone_number: body.phone_number.trim(),
      id_number: body.id_number.trim(),
      email: body.email.trim().toLowerCase(),
      start_date: body.start_date,
      end_date: body.end_date,
      pickup_location: body.pickup_location.trim(),
      total_days: Number(body.total_days),
      total_price: Number(body.total_price),
      status: body.status || 'pending',
    };

    const { data, error } = await supabase
      .from('reservations')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[reservations POST] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(201).json({
      success: true,
      message: 'Reservation created successfully.',
      data,
    });
  } catch (err) {
    console.error('[reservations POST] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reservations/:id
// Update an existing reservation (partial updates are supported).
//
// Common use cases: change status, correct customer details, adjust dates.
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must contain at least one field to update.',
      });
    }

    // Validate only the fields that were provided (partial mode)
    const validationErrors = validateReservationPayload(body, false);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    // Confirm reservation exists before attempting update
    const { data: existing, error: fetchError } = await supabase
      .from('reservations')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, message: `Reservation with id '${id}' not found.` });
    }

    // If vehicle_id is being changed, verify the new vehicle exists
    if (body.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id')
        .eq('id', body.vehicle_id)
        .single();

      if (vehicleError || !vehicle) {
        return res.status(404).json({
          success: false,
          message: `Vehicle with id '${body.vehicle_id}' does not exist.`,
        });
      }
    }

    // Build the update payload from only the provided fields
    const UPDATABLE_FIELDS = [
      'vehicle_id',
      'full_name',
      'phone_number',
      'id_number',
      'email',
      'start_date',
      'end_date',
      'pickup_location',
      'total_days',
      'total_price',
      'status',
    ];

    const updatePayload = {};
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) {
        updatePayload[field] = body[field];
      }
    }

    // Normalise string fields if they are being updated
    if (updatePayload.full_name) updatePayload.full_name = updatePayload.full_name.trim();
    if (updatePayload.phone_number) updatePayload.phone_number = updatePayload.phone_number.trim();
    if (updatePayload.id_number) updatePayload.id_number = updatePayload.id_number.trim();
    if (updatePayload.email) updatePayload.email = updatePayload.email.trim().toLowerCase();
    if (updatePayload.pickup_location) updatePayload.pickup_location = updatePayload.pickup_location.trim();
    if (updatePayload.total_days) updatePayload.total_days = Number(updatePayload.total_days);
    if (updatePayload.total_price) updatePayload.total_price = Number(updatePayload.total_price);

    const { data, error } = await supabase
      .from('reservations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[reservations PUT] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Reservation updated successfully.',
      data,
    });
  } catch (err) {
    console.error('[reservations PUT] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/reservations/:id
// Permanently remove a reservation record.
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Confirm reservation exists before attempting delete
    const { data: existing, error: fetchError } = await supabase
      .from('reservations')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, message: `Reservation with id '${id}' not found.` });
    }

    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[reservations DELETE] Supabase error:', error.message);
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      message: `Reservation with id '${id}' has been deleted.`,
    });
  } catch (err) {
    console.error('[reservations DELETE] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;

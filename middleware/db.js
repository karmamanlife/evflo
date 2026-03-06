// db.js — Supabase service role client
// Lives at: /evflo/middleware/db.js
// IMPORTANT: service_role key bypasses RLS — server/middleware use only.
// NEVER use this key in the frontend.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // NOT the anon key
);

module.exports = supabase;

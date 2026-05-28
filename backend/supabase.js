const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
        realtime: {
            transport: ws
        }
    }
);

module.exports = supabase;
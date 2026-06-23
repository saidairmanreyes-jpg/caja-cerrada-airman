const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kkrpgxhqgbywavkjonqm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcnBneGhxZ2J5d2F2a2pvbnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjU0MzAsImV4cCI6MjA4OTk0MTQzMH0.yNenBh3R1v3OH0ZVXzYG6T9abQBzttPbIdh5BKTlm4k';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verify() {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    console.log('Total products in DB:', count);

    const { data: samples } = await supabase.from('products').select('code').limit(10);
    console.log('Sample codes:', JSON.stringify(samples.map(s => s.code)));

    const { data: pCheck } = await supabase.from('products').select('code').ilike('code', 'P%').limit(5);
    console.log('Codes starting with P:', JSON.stringify(pCheck.map(p => p.code)));

    process.exit(0);
}

verify();

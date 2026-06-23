const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kkrpgxhqgbywavkjonqm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcnBneGhxZ2J5d2F2a2pvbnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjU0MzAsImV4cCI6MjA4OTk0MTQzMH0.yNenBh3R1v3OH0ZVXzYG6T9abQBzttPbIdh5BKTlm4k';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
const start = 100;
const end = 269;
const warehouse = 'MATRIZ';

async function main() {
    let allLocs = [];
    for (const letter of letters) {
        for (let i = start; i <= end; i++) {
            allLocs.push({
                name: `${letter}${i}`,
                is_occupied: false,
                warehouse: warehouse
            });
        }
    }

    console.log(`Total locations to process: ${allLocs.length}`);

    // Insert using upsert with ignoreDuplicates: true
    const chunkSize = 500;
    for (let i = 0; i < allLocs.length; i += chunkSize) {
        const chunk = allLocs.slice(i, i + chunkSize);
        // Supabase `upsert` takes an options object with `onConflict` and `ignoreDuplicates`.
        // The unique constraint is `locations_name_warehouse_key` which corresponds to columns: name, warehouse.
        const { error: errInsert } = await supabase.from('locations').upsert(chunk, { 
            onConflict: 'name,warehouse', 
            ignoreDuplicates: true 
        });
        
        if (errInsert) {
            console.error(`Error inserting chunk ${i} to ${i + chunkSize}:`, errInsert);
            return;
        }
        console.log(`Upserted chunk ${i} to ${i + chunkSize}...`);
    }

    console.log("Finished inserting locations!");
}

main().catch(console.error);

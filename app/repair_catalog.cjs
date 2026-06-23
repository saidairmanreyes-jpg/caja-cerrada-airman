const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');

const supabaseUrl = 'https://kkrpgxhqgbywavkjonqm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrcnBneGhxZ2J5d2F2a2pvbnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjU0MzAsImV4cCI6MjA4OTk0MTQzMH0.yNenBh3R1v3OH0ZVXzYG6T9abQBzttPbIdh5BKTlm4k';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const excelPath = 'c:\\Users\\Sistemas\\Downloads\\CAJA CERRADA AIRMAN\\CAJA CERRADA FIN-bak 1.xlsm';

async function repair() {
    console.log('--- STARTING ROBUST CATALOG REPAIR ---');
    
    if (!fs.existsSync(excelPath)) {
        console.error('Excel file not found at:', excelPath);
        return;
    }

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets['BD DESCRIPCION'];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`Excel: ${data.length} items.`);

    // Refresh DB map
    const { data: dbProducts } = await supabase.from('products').select('id, code');
    const dbMap = new Map(dbProducts.map(p => [p.code, p.id]));
    console.log(`DB: ${dbProducts.length} items currently.`);

    let counters = { updated: 0, created: 0, merged: 0 };

    for (const row of data) {
        const correctCode = String(row['CODIGO'] || '').trim().toUpperCase();
        const description = String(row['DESCRIPCION'] || '').trim().toUpperCase();

        if (!correctCode || correctCode.length !== 10) continue;

        const wrongCode = correctCode.startsWith('P') ? correctCode.substring(1) : null;
        
        const correctId = dbMap.get(correctCode);
        const wrongId   = wrongCode ? dbMap.get(wrongCode) : null;

        if (wrongId) {
            if (correctId) {
                // MERGE: Move inventory from wrongId to correctId
                console.log(`Merging ${wrongCode} (${wrongId}) -> ${correctCode} (${correctId})`);
                
                // Update inventory
                await supabase.from('inventory').update({ product_id: correctId }).eq('product_id', wrongId);
                // Update picking_items
                await supabase.from('picking_items').update({ product_id: correctId }).eq('product_id', wrongId);
                
                // Delete wrong product
                const { error: delErr } = await supabase.from('products').delete().eq('id', wrongId);
                if (!delErr) {
                    counters.merged++;
                    dbMap.delete(wrongCode);
                } else {
                    console.error(`Error deleting merged ${wrongCode}:`, delErr);
                }
            } else {
                // RENAME
                console.log(`Renaming ${wrongCode} -> ${correctCode}`);
                const { error: updErr } = await supabase.from('products').update({ code: correctCode, description }).eq('id', wrongId);
                if (!updErr) {
                    counters.updated++;
                    dbMap.set(correctCode, wrongId);
                    dbMap.delete(wrongCode);
                } else {
                    console.error(`Error renaming ${wrongCode}:`, updErr);
                }
            }
        } else if (!correctId) {
            // INSERT
            console.log(`Inserting ${correctCode}`);
            const { data: insData, error: insErr } = await supabase.from('products').insert({ code: correctCode, description }).select().single();
            if (!insErr) {
                counters.created++;
                dbMap.set(correctCode, insData.id);
            } else {
                console.error(`Error inserting ${correctCode}:`, insErr);
            }
        } else {
            // Just update description
            await supabase.from('products').update({ description }).eq('id', correctId);
        }
    }

    console.log(`--- REPAIR FINISHED ---`);
    console.log(`Created: ${counters.created}, Updated/Renamed: ${counters.updated}, Merged/Cleaned: ${counters.merged}`);
    process.exit(0);
}

repair();
